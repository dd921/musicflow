const STRAVA_API_URL = "https://www.strava.com/api/v3"
const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"

export function getStravaAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/strava/callback`,
    scope: "activity:read_all",
    approval_prompt: "auto",
  })
  return `${STRAVA_AUTH_URL}?${params}`
}

export async function exchangeStravaCode(code: string) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status}`)
  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_at: number
  }>
}

export type StravaActivity = {
  id: number
  name: string
  type: string
  start_date: string
  elapsed_time: number
  moving_time: number
  distance: number
  average_heartrate?: number
  max_heartrate?: number
  average_speed: number
  max_speed: number
  total_elevation_gain: number
  calories?: number
}

export async function fetchStravaActivities(
  accessToken: string,
  options: { after?: number; page?: number; perPage?: number } = {}
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    per_page: String(options.perPage ?? 50),
    page: String(options.page ?? 1),
  })
  if (options.after) params.set("after", String(options.after))

  const res = await fetch(`${STRAVA_API_URL}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Strava activities fetch failed: ${res.status}`)
  return res.json() as Promise<StravaActivity[]>
}

export type StravaStreams = Partial<
  Record<
    "time" | "heartrate" | "velocity_smooth" | "altitude" | "cadence" | "watts",
    { data: number[] }
  >
>

export async function fetchActivityStreams(
  accessToken: string,
  stravaActivityId: bigint
): Promise<StravaStreams> {
  const keys = "time,heartrate,velocity_smooth,altitude,cadence,watts"
  const res = await fetch(
    `${STRAVA_API_URL}/activities/${stravaActivityId}/streams?keys=${keys}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (res.status === 404) return {}
  if (!res.ok) throw new Error(`Strava streams fetch failed: ${res.status}`)
  return res.json() as Promise<StravaStreams>
}

export async function refreshStravaToken(refreshToken: string) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`)
  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_at: number
  }>
}
