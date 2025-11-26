"""
Formatting utilities for displaying activity data with unit and timezone conversions.
"""
from datetime import datetime
from typing import Optional
from units import UnitConverter, TimezoneConverter


def format_distance(distance_m: float, units: str = 'metric') -> str:
    """
    Format distance with appropriate units.
    
    Args:
        distance_m: Distance in meters
        units: 'metric' or 'imperial'
    
    Returns:
        Formatted distance string
    """
    if units == 'imperial':
        distance_miles = UnitConverter.km_to_miles(distance_m / 1000.0)
        return f"{distance_miles:.2f} mi"
    else:
        return f"{distance_m / 1000.0:.2f} km"


def format_pace(pace_min_per_km: Optional[float], units: str = 'metric') -> str:
    """
    Format pace with appropriate units.
    
    Args:
        pace_min_per_km: Pace in minutes per kilometer
        units: 'metric' or 'imperial'
    
    Returns:
        Formatted pace string
    """
    if pace_min_per_km is None or pace_min_per_km <= 0:
        return "N/A"
    
    if units == 'imperial':
        pace_mile = UnitConverter.pace_km_to_mile(pace_min_per_km)
        return f"{pace_mile:.2f} min/mi"
    else:
        return f"{pace_min_per_km:.2f} min/km"


def format_speed(speed_ms: float, units: str = 'metric') -> str:
    """
    Format speed with appropriate units.
    
    Args:
        speed_ms: Speed in meters per second
        units: 'metric' or 'imperial'
    
    Returns:
        Formatted speed string
    """
    if units == 'imperial':
        speed_mph = UnitConverter.speed_kmh_to_mph(speed_ms * 3.6)
        return f"{speed_mph:.1f} mph"
    else:
        return f"{speed_ms * 3.6:.1f} km/h"


def format_elevation(elevation_m: float, units: str = 'metric') -> str:
    """
    Format elevation with appropriate units.
    
    Args:
        elevation_m: Elevation in meters
        units: 'metric' or 'imperial'
    
    Returns:
        Formatted elevation string
    """
    if units == 'imperial':
        elevation_ft = UnitConverter.meters_to_feet(elevation_m)
        return f"{elevation_ft:.0f} ft"
    else:
        return f"{elevation_m:.0f} m"


def format_datetime(dt: datetime, timezone: str = 'UTC') -> str:
    """
    Format datetime with timezone conversion.
    
    Args:
        dt: Datetime object
        timezone: Target timezone code (EST, CST, PST, UTC)
    
    Returns:
        Formatted datetime string
    """
    if dt is None:
        return "N/A"
    
    # Convert to target timezone
    dt_converted = TimezoneConverter.convert_datetime(dt, timezone)
    
    # Format as date and time
    return dt_converted.strftime('%Y-%m-%d %H:%M:%S %Z')


def format_date(dt: datetime, timezone: str = 'UTC') -> str:
    """
    Format date only with timezone conversion.
    
    Args:
        dt: Datetime object
        timezone: Target timezone code
    
    Returns:
        Formatted date string
    """
    if dt is None:
        return "N/A"
    
    dt_converted = TimezoneConverter.convert_datetime(dt, timezone)
    return dt_converted.strftime('%Y-%m-%d')


def format_time(dt: datetime, timezone: str = 'UTC') -> str:
    """
    Format time only with timezone conversion.
    
    Args:
        dt: Datetime object
        timezone: Target timezone code
    
    Returns:
        Formatted time string
    """
    if dt is None:
        return "N/A"
    
    dt_converted = TimezoneConverter.convert_datetime(dt, timezone)
    return dt_converted.strftime('%H:%M:%S')


def calculate_pace_from_speed(speed_ms: float) -> Optional[float]:
    """
    Calculate pace (min/km) from speed (m/s).
    
    Args:
        speed_ms: Speed in meters per second
    
    Returns:
        Pace in minutes per kilometer, or None if speed is 0
    """
    if speed_ms <= 0:
        return None
    return 1000 / (speed_ms * 60)

