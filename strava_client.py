"""
Strava API client for fetching activity data.
Handles authentication and rate limiting.
"""
import requests
from datetime import datetime, timedelta
import time
from typing import List, Dict, Optional
import config


class StravaClient:
    """Client for interacting with Strava API."""

    def __init__(self, access_token: Optional[str] = None, athlete_id: Optional[int] = None):
        """
        Initialize Strava client.

        Args:
            access_token: OAuth access token for Strava API
            athlete_id: Expected athlete ID for ownership verification
        """
        self.access_token = access_token
        self.athlete_id = athlete_id
        self.base_url = "https://www.strava.com/api/v3"
        self.rate_limit_remaining = config.STRAVA_RATE_LIMIT
        self.rate_limit_reset = None
        
    def get_authorization_url(self) -> str:
        """Generate Strava OAuth authorization URL."""
        params = {
            'client_id': config.STRAVA_CLIENT_ID,
            'redirect_uri': config.STRAVA_REDIRECT_URI,
            'response_type': 'code',
            'scope': 'activity:read_all',
            'approval_prompt': 'force'
        }
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        return f"https://www.strava.com/oauth/authorize?{query_string}"
    
    def exchange_code_for_token(self, code: str) -> Dict:
        """Exchange authorization code for access token."""
        url = "https://www.strava.com/oauth/token"
        data = {
            'client_id': config.STRAVA_CLIENT_ID,
            'client_secret': config.STRAVA_CLIENT_SECRET,
            'code': code,
            'grant_type': 'authorization_code'
        }
        response = requests.post(url, data=data)
        response.raise_for_status()
        return response.json()
    
    def refresh_token(self, refresh_token: str) -> Dict:
        """Refresh access token using refresh token."""
        url = "https://www.strava.com/oauth/token"
        data = {
            'client_id': config.STRAVA_CLIENT_ID,
            'client_secret': config.STRAVA_CLIENT_SECRET,
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token'
        }
        response = requests.post(url, data=data)
        response.raise_for_status()
        return response.json()
    
    def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """Make authenticated request to Strava API with rate limiting."""
        if not self.access_token:
            raise ValueError("Access token required. Please authenticate first.")
        
        url = f"{self.base_url}/{endpoint}"
        headers = {'Authorization': f'Bearer {self.access_token}'}
        
        # Check rate limit
        if self.rate_limit_remaining is not None and self.rate_limit_remaining <= 0:
            if self.rate_limit_reset:
                wait_time = self.rate_limit_reset - time.time()
                if wait_time > 0:
                    raise Exception(f"Rate limit exceeded. Wait {wait_time:.0f} seconds.")
        
        response = requests.get(url, headers=headers, params=params)
        
        # Update rate limit info from headers
        if 'X-RateLimit-Remaining' in response.headers:
            self.rate_limit_remaining = int(response.headers['X-RateLimit-Remaining'])
        if 'X-RateLimit-Reset' in response.headers:
            self.rate_limit_reset = int(response.headers['X-RateLimit-Reset'])
        
        response.raise_for_status()
        return response.json()
    
    def get_athlete(self) -> Dict:
        """Get authenticated athlete information."""
        return self._make_request('athlete')
    
    def get_activities(self, before: Optional[datetime] = None, 
                      after: Optional[datetime] = None, 
                      per_page: int = 30) -> List[Dict]:
        """
        Get list of activities.
        
        Args:
            before: Get activities before this date
            after: Get activities after this date
            per_page: Number of activities per page (max 200)
        
        Returns:
            List of activity summaries
        """
        params = {'per_page': min(per_page, 200)}
        
        if before:
            params['before'] = int(before.timestamp())
        if after:
            params['after'] = int(after.timestamp())
        
        activities = []
        page = 1
        
        while True:
            params['page'] = page
            response = self._make_request('athlete/activities', params=params)
            
            if not response:
                break
            
            activities.extend(response)
            
            # Strava API limitation: typically returns max 200 activities per request
            if len(response) < per_page:
                break
            
            page += 1
            
            # Safety limit to prevent infinite loops
            if page > 10:
                break
        
        return activities
    
    def get_activity(self, activity_id: int, include_all_efforts: bool = False,
                     verify_ownership: bool = True) -> Dict:
        """
        Get detailed activity data including streams.

        Args:
            activity_id: Strava activity ID
            include_all_efforts: Include segment efforts
            verify_ownership: If True, verify activity belongs to authenticated athlete

        Returns:
            Detailed activity data

        Raises:
            PermissionError: If verify_ownership is True and activity doesn't belong to athlete
        """
        params = {}
        if include_all_efforts:
            params['include_all_efforts'] = 'true'

        activity = self._make_request(f'activities/{activity_id}', params=params)

        # Verify ownership if athlete_id is set and verification requested
        if verify_ownership and self.athlete_id:
            activity_athlete_id = activity.get('athlete', {}).get('id')
            if activity_athlete_id != self.athlete_id:
                raise PermissionError(
                    f"Activity {activity_id} does not belong to authenticated athlete"
                )

        return activity
    
    def get_activity_streams(self, activity_id: int, 
                            types: List[str] = None) -> Dict:
        """
        Get activity stream data (time series data).
        
        Args:
            activity_id: Strava activity ID
            types: List of stream types to retrieve
                   Options: time, distance, latlng, altitude, velocity_smooth,
                           heartrate, cadence, watts, temp, moving, grade_smooth
        
        Returns:
            Dictionary of stream data
        """
        if types is None:
            types = ['time', 'distance', 'latlng', 'altitude', 
                    'velocity_smooth', 'heartrate', 'cadence', 'watts', 'temp']
        
        params = {'keys': ','.join(types), 'key_by_type': 'true'}
        streams = self._make_request(f'activities/{activity_id}/streams', params=params)
        
        # When key_by_type=true, Strava returns a dict keyed by stream type
        # When key_by_type=false (or not set), Strava returns a list
        if isinstance(streams, dict):
            # Already in the format we want, but ensure structure is consistent
            result = {}
            for stream_type, stream_data in streams.items():
                if isinstance(stream_data, dict):
                    # Already formatted correctly
                    result[stream_type] = {
                        'data': stream_data.get('data', []),
                        'series_type': stream_data.get('series_type', 'distance'),
                        'original_size': stream_data.get('original_size', 0),
                        'resolution': stream_data.get('resolution', 'high')
                    }
                elif isinstance(stream_data, list):
                    # Just data array, wrap it
                    result[stream_type] = {
                        'data': stream_data,
                        'series_type': 'distance',
                        'original_size': len(stream_data),
                        'resolution': 'high'
                    }
            return result
        elif isinstance(streams, list):
            # Convert list format to dict format
            result = {}
            for stream in streams:
                # Validate each stream is a dict
                if not isinstance(stream, dict):
                    continue
                stream_type = stream.get('type')
                if stream_type:
                    result[stream_type] = {
                        'data': stream.get('data', []),
                        'series_type': stream.get('series_type', 'distance'),
                        'original_size': stream.get('original_size', 0),
                        'resolution': stream.get('resolution', 'high')
                    }
            return result
        else:
            raise ValueError(f"Unexpected streams format: {type(streams)}. Expected dict or list.")

