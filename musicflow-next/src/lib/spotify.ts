const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"

const SPOTIFY_SCOPES = [
  "user-read-recently-played",
  "user-read-playback-state",
  "user-read-currently-playing",
  "playlist-modify-public",
].join(" ")

export function getSpotifyAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/spotify/callback`,
    scope: SPOTIFY_SCOPES,
    show_dialog: "false",
  })
  return `${SPOTIFY_AUTH_URL}?${params}`
}

function spotifyAuthHeader(): string {
  return `Basic ${Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64")}`
}

export async function exchangeSpotifyCode(code: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: spotifyAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/spotify/callback`,
    }),
  })
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status}`)
  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
  }>
}

export async function refreshSpotifyToken(refreshToken: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: spotifyAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status}`)
  return res.json() as Promise<{
    access_token: string
    expires_in: number
    refresh_token?: string
  }>
}
