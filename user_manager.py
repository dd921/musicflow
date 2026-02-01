"""
User management module for MusicFlow application.
Handles user registration, authentication, and validation.
"""
import bcrypt
from datetime import datetime
from typing import Dict, Optional, Tuple
from database import get_db_connection, get_cursor, placeholder, USE_POSTGRES


class UserManager:
    """Manages user accounts and authentication."""

    MIN_PASSWORD_LENGTH = 8
    MIN_USERNAME_LENGTH = 3
    MAX_USERNAME_LENGTH = 32

    def __init__(self):
        """Initialize user manager."""
        pass

    def create_user(self, username: str, password: str) -> Tuple[bool, str, Optional[int]]:
        """
        Create a new user account.

        Args:
            username: The desired username
            password: The user's password

        Returns:
            Tuple of (success, message, user_id or None)
        """
        # Validate username
        username = username.strip().lower()

        if len(username) < self.MIN_USERNAME_LENGTH:
            return False, f"Username must be at least {self.MIN_USERNAME_LENGTH} characters", None

        if len(username) > self.MAX_USERNAME_LENGTH:
            return False, f"Username must be at most {self.MAX_USERNAME_LENGTH} characters", None

        if not username.replace('_', '').isalnum():
            return False, "Username can only contain letters, numbers, and underscores", None

        # Validate password
        if len(password) < self.MIN_PASSWORD_LENGTH:
            return False, f"Password must be at least {self.MIN_PASSWORD_LENGTH} characters", None

        # Check if username already exists
        if self.get_user_by_username(username):
            return False, "Username already exists", None

        # Hash password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

        # Create user
        conn = get_db_connection()
        cursor = get_cursor(conn)

        try:
            p = placeholder()
            if USE_POSTGRES:
                cursor.execute(f'''
                    INSERT INTO users (username, password_hash, created_at)
                    VALUES ({p}, {p}, {p})
                    RETURNING id
                ''', (username, password_hash.decode('utf-8'), datetime.now().isoformat()))
                user_id = cursor.fetchone()['id']
            else:
                cursor.execute(f'''
                    INSERT INTO users (username, password_hash, created_at)
                    VALUES ({p}, {p}, {p})
                ''', (username, password_hash.decode('utf-8'), datetime.now().isoformat()))
                user_id = cursor.lastrowid

            conn.commit()
            cursor.close()
            conn.close()

            return True, "Account created successfully", user_id

        except Exception as e:
            cursor.close()
            conn.close()
            return False, f"Error creating account: {str(e)}", None

    def authenticate(self, username: str, password: str) -> Tuple[bool, str, Optional[Dict]]:
        """
        Authenticate a user.

        Args:
            username: The username
            password: The password to verify

        Returns:
            Tuple of (success, message, user dict or None)
        """
        username = username.strip().lower()

        user = self.get_user_by_username(username)

        if not user:
            return False, "Invalid username or password", None

        # Verify password
        if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return True, "Login successful", {
                'id': user['id'],
                'username': user['username'],
                'created_at': user['created_at']
            }

        return False, "Invalid username or password", None

    def get_user_by_username(self, username: str) -> Optional[Dict]:
        """
        Get a user by username.

        Args:
            username: The username to look up

        Returns:
            User dictionary or None
        """
        conn = get_db_connection()
        cursor = get_cursor(conn)

        p = placeholder()
        cursor.execute(f'''
            SELECT id, username, password_hash, created_at
            FROM users WHERE username = {p}
        ''', (username.strip().lower(),))

        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return None

        return {
            'id': row['id'],
            'username': row['username'],
            'password_hash': row['password_hash'],
            'created_at': row['created_at']
        }

    def get_user_by_id(self, user_id: int) -> Optional[Dict]:
        """
        Get a user by ID.

        Args:
            user_id: The user's ID

        Returns:
            User dictionary (without password_hash) or None
        """
        conn = get_db_connection()
        cursor = get_cursor(conn)

        p = placeholder()
        cursor.execute(f'''
            SELECT id, username, created_at
            FROM users WHERE id = {p}
        ''', (user_id,))

        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return None

        return {
            'id': row['id'],
            'username': row['username'],
            'created_at': row['created_at']
        }

    def change_password(self, user_id: int, old_password: str, new_password: str) -> Tuple[bool, str]:
        """
        Change a user's password.

        Args:
            user_id: The user's ID
            old_password: Current password for verification
            new_password: New password to set

        Returns:
            Tuple of (success, message)
        """
        conn = get_db_connection()
        cursor = get_cursor(conn)

        p = placeholder()
        cursor.execute(f'''
            SELECT password_hash FROM users WHERE id = {p}
        ''', (user_id,))

        row = cursor.fetchone()

        if not row:
            cursor.close()
            conn.close()
            return False, "User not found"

        # Verify old password
        if not bcrypt.checkpw(old_password.encode('utf-8'), row['password_hash'].encode('utf-8')):
            cursor.close()
            conn.close()
            return False, "Current password is incorrect"

        # Validate new password
        if len(new_password) < self.MIN_PASSWORD_LENGTH:
            cursor.close()
            conn.close()
            return False, f"New password must be at least {self.MIN_PASSWORD_LENGTH} characters"

        # Hash and store new password
        new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())

        cursor.execute(f'''
            UPDATE users SET password_hash = {p} WHERE id = {p}
        ''', (new_hash.decode('utf-8'), user_id))

        conn.commit()
        cursor.close()
        conn.close()

        return True, "Password changed successfully"

    def delete_user(self, user_id: int) -> Tuple[bool, str]:
        """
        Delete a user and their associated data.

        Args:
            user_id: The user's ID

        Returns:
            Tuple of (success, message)
        """
        conn = get_db_connection()
        cursor = get_cursor(conn)

        try:
            p = placeholder()
            # Delete user's tokens
            cursor.execute(f'DELETE FROM oauth_tokens WHERE user_id = {p}', (user_id,))

            # Delete user's tracks
            cursor.execute(f'DELETE FROM tracks WHERE user_id = {p}', (user_id,))

            # Delete user
            cursor.execute(f'DELETE FROM users WHERE id = {p}', (user_id,))

            if cursor.rowcount == 0:
                cursor.close()
                conn.close()
                return False, "User not found"

            conn.commit()
            cursor.close()
            conn.close()
            return True, "User deleted successfully"

        except Exception as e:
            cursor.close()
            conn.close()
            return False, f"Error deleting user: {str(e)}"

    def get_all_users(self) -> list:
        """
        Get all users (for admin purposes).

        Returns:
            List of user dictionaries (without password hashes)
        """
        conn = get_db_connection()
        cursor = get_cursor(conn)

        cursor.execute('''
            SELECT id, username, created_at FROM users ORDER BY created_at DESC
        ''')

        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        return [{
            'id': row['id'],
            'username': row['username'],
            'created_at': row['created_at']
        } for row in rows]
