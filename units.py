"""
Unit conversion and timezone utilities.
"""
from datetime import datetime
from typing import Dict, Optional
import pytz


class UnitConverter:
    """Handles unit conversions between metric and imperial."""
    
    # Conversion constants
    KM_TO_MILES = 0.621371
    MILES_TO_KM = 1.60934
    METERS_TO_FEET = 3.28084
    FEET_TO_METERS = 0.3048
    
    @staticmethod
    def km_to_miles(km: float) -> float:
        """Convert kilometers to miles."""
        return km * UnitConverter.KM_TO_MILES
    
    @staticmethod
    def miles_to_km(miles: float) -> float:
        """Convert miles to kilometers."""
        return miles * UnitConverter.MILES_TO_KM
    
    @staticmethod
    def meters_to_feet(meters: float) -> float:
        """Convert meters to feet."""
        return meters * UnitConverter.METERS_TO_FEET
    
    @staticmethod
    def feet_to_meters(feet: float) -> float:
        """Convert feet to meters."""
        return feet * UnitConverter.FEET_TO_METERS
    
    @staticmethod
    def pace_km_to_mile(pace_min_per_km: float) -> float:
        """Convert pace from min/km to min/mile."""
        if pace_min_per_km is None or pace_min_per_km <= 0:
            return None
        return pace_min_per_km * UnitConverter.MILES_TO_KM
    
    @staticmethod
    def pace_mile_to_km(pace_min_per_mile: float) -> float:
        """Convert pace from min/mile to min/km."""
        if pace_min_per_mile is None or pace_min_per_mile <= 0:
            return None
        return pace_min_per_mile * UnitConverter.KM_TO_MILES
    
    @staticmethod
    def speed_kmh_to_mph(speed_kmh: float) -> float:
        """Convert speed from km/h to mph."""
        if speed_kmh is None or speed_kmh <= 0:
            return None
        return speed_kmh * UnitConverter.KM_TO_MILES
    
    @staticmethod
    def speed_mph_to_kmh(speed_mph: float) -> float:
        """Convert speed from mph to km/h."""
        if speed_mph is None or speed_mph <= 0:
            return None
        return speed_mph * UnitConverter.MILES_TO_KM


class TimezoneConverter:
    """Handles timezone conversions."""
    
    # Common US timezones
    TIMEZONES = {
        'EST': 'America/New_York',  # Eastern Standard Time
        'CST': 'America/Chicago',    # Central Standard Time
        'PST': 'America/Los_Angeles', # Pacific Standard Time
        'UTC': 'UTC',
    }
    
    @staticmethod
    def convert_datetime(dt: datetime, target_tz: str) -> datetime:
        """
        Convert datetime to target timezone.
        
        Args:
            dt: Datetime object (timezone-aware or naive)
            target_tz: Target timezone code (EST, CST, PST, UTC)
        
        Returns:
            Datetime in target timezone
        """
        if target_tz not in TimezoneConverter.TIMEZONES:
            return dt
        
        target_timezone = pytz.timezone(TimezoneConverter.TIMEZONES[target_tz])
        
        # If datetime is naive, assume UTC
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        
        # Convert to target timezone
        return dt.astimezone(target_timezone)
    
    @staticmethod
    def get_timezone_name(tz_code: str) -> str:
        """Get full timezone name from code."""
        names = {
            'EST': 'Eastern Time (ET)',
            'CST': 'Central Time (CT)',
            'PST': 'Pacific Time (PT)',
            'UTC': 'Coordinated Universal Time (UTC)',
        }
        return names.get(tz_code, tz_code)
    
    @staticmethod
    def format_datetime(dt: datetime, tz_code: Optional[str] = None) -> str:
        """
        Format datetime with timezone.
        
        Args:
            dt: Datetime object
            tz_code: Optional timezone code to convert to
        
        Returns:
            Formatted datetime string
        """
        if tz_code:
            dt = TimezoneConverter.convert_datetime(dt, tz_code)
        
        return dt.strftime('%Y-%m-%d %H:%M:%S %Z')
    
    @staticmethod
    def get_available_timezones() -> Dict[str, str]:
        """Get dictionary of available timezone codes and names."""
        return {
            'EST': 'Eastern Time (ET)',
            'CST': 'Central Time (CT)',
            'PST': 'Pacific Time (PT)',
            'UTC': 'Coordinated Universal Time (UTC)',
        }

