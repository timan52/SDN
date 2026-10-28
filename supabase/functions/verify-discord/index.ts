/** Server-side Discord guild / GM role check. NEVER expose the Bot token in browser code. */
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
const DISCORD_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!;
const DISCORD_GUILD = Deno.env.get('DISCORD_GUILD_ID')!;
const GM_ROLE = Deno.env.get('DISCORD_GM_ROLE_ID')!;
// Optional independent HR role. Leave unset if HR should not yet be enabled.
const HR_ROLE = Deno.env.get('DISCORD_HR_ROLE_ID') ?? ''; 
const ALLOWED_ORIGINS = (Deno.env.get('SDN_ALLOWED_ORIGINS') ?? 'http://localhost:8000').split(',').map(s => s.trim()).filter(Boolean);

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}

Deno.serve(async request => {
  const headers = cors(request.headers.get('Origin'));
  const respond = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  const origin = request.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return respond(403, { error: 'Origin not allowed' });
  if (![URL, SERVICE_KEY, DISCORD_TOKEN, DISCORD_GUILD, GM_ROLE].every(Boolean)) {
    return respond(503, { error: 'Server configuration incomplete' });
  }

  const jwt = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return respond(401, { error: 'Missing session token' });

  // A user's claimed Discord ID is NEVER accepted from the browser.
  const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return respond(401, { error: 'Invalid session token' });
  const user = userData.user;
  const discord = user.identities?.find(identity => identity.provider === 'discord');
  const discordId = String(discord?.provider_id ?? discord?.identity_data?.sub ?? '');
  if (!/^\d{16,22}$/.test(discordId)) return respond(403, { error: 'Discord login required' });

  try {
    // Bot must be a member of the RP server. Checking via Bot API avoids
    // depending on a short-lived user provider_token after page reload.
    const response = await fetch(`https://discord.com/api/v10/guilds/${DISCORD_GUILD}/members/${discordId}`, {
      headers: { Authorization: `Bot ${DISCORD_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200 && response.status !== 404) {
      // Outages / rate limits do not turn a failed check into an approval.
      return respond(503, { error: 'Discord currently unavailable for membership verification' });
    }
    const member = response.ok ? await response.json() : null;
    const verified = Boolean(member && member.pending !== true);
    const isAdmin = verified && Array.isArray(member.roles) && member.roles.includes(GM_ROLE);
    const isHR = verified && Boolean(HR_ROLE) && Array.isArray(member.roles) && member.roles.includes(HR_ROLE);
    const checkedAt = new Date();
    const expires = new Date(checkedAt.getTime() + (verified ? 5 * 60_000 : 0));
    const { error: updateError } = await admin.from('sdn_access').upsert({
      user_id: user.id,
      discord_id: discordId,
      is_admin: Boolean(isAdmin),
      is_hr: Boolean(isHR),
      checked_at: checkedAt.toISOString(),
      verified_until: expires.toISOString(),
    });
    if (updateError) return respond(503, { error: 'Cannot update membership authorization' });
    // Store only display information of verified guild members. RLS permits other
    // verified members to search this minimal directory, not privileged auth data.
    if (verified) {
      const accountName = String(member?.user?.username || user.user_metadata?.user_name || discordId).slice(0, 100);
      const displayName = String(member?.nick || member?.user?.global_name || accountName).slice(0, 100);
      const { error: profileError } = await admin.from('sdn_discord_profiles').upsert({
        user_id: user.id, discord_name: displayName, discord_username: accountName,
        updated_at: checkedAt.toISOString(),
      });
      if (profileError) return respond(503, { error: 'Cannot update verified Discord profile' });
    }
    return respond(200, { member: verified, admin: Boolean(isAdmin), hr: Boolean(isHR), expiresAt: expires.toISOString() });
  } catch {
    return respond(503, { error: 'Discord membership check could not be completed' });
  }
});
