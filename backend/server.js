import {
  createHash,
  pbkdf2,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import pg from 'pg';

const port = Number(process.env.PORT || 8080);
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;
const sessionCookieName = 'agrisense_session';
const pbkdf2Async = promisify(pbkdf2);
const backendDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [join(backendDirectory, '..', '.env.local'), join(backendDirectory, '..', '.env')]
});
const schemaPath = join(backendDirectory, 'schema.sql');
const frontendDirectory = resolve(backendDirectory, '..', 'dist');
const counties = {
  Kisii: [-0.6817, 34.7667],
  Nyamira: [-0.5633, 34.9358],
  Migori: [-1.0634, 34.4731],
  'Homa Bay': [-0.5273, 34.4571],
  Kakamega: [0.2827, 34.7519],
  Nakuru: [-0.3031, 36.08],
  Nairobi: [-1.2921, 36.8219],
  Meru: [0.0463, 37.6559],
  Kiambu: [-1.1714, 36.8356],
  Mombasa: [-4.0435, 39.6682]
};

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Set it to your PostgreSQL connection string.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.PGPOOL_MAX || 10),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});
const migrationPool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || databaseUrl,
  max: 1,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});
pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL connection error:', error);
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(body);
}

async function serveFrontend(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { message: 'Method not allowed.' });
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { message: 'Invalid URL path.' });
    return;
  }

  const requestedFile = resolve(frontendDirectory, `.${decodedPath}`);
  const fileRelativePath = relative(frontendDirectory, requestedFile);
  if (fileRelativePath === '..' || fileRelativePath.startsWith(`..${sep}`)) {
    sendJson(response, 404, { message: 'Not found.' });
    return;
  }

  let filePath = requestedFile;
  let content;
  try {
    content = await readFile(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
    if (extname(decodedPath)) {
      sendJson(response, 404, { message: 'Not found.' });
      return;
    }
    filePath = join(frontendDirectory, 'index.html');
    try {
      content = await readFile(filePath);
    } catch (fallbackError) {
      if (fallbackError.code === 'ENOENT') {
        sendJson(response, 503, { message: 'Frontend build is missing. Run npm run build.' });
        return;
      }
      throw fallbackError;
    }
  }

  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': content.length
  });
  response.end(request.method === 'HEAD' ? undefined : content);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) {
      throw new HttpError(413, 'Request body is too large.');
    }
  }
  if (!body) return {};

  let value;
  try {
    value = JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return value;
}

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function requiredText(value, maxLength) {
  const result = text(value, maxLength);
  if (!result) throw new HttpError(400, 'Required fields are missing.');
  return result;
}

function normalizedEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

function validatePassword(value, isRegistration) {
  if (typeof value !== 'string' || value.length > 128 || (isRegistration && value.length < 10)) {
    throw new HttpError(400, isRegistration
      ? 'Use a password between 10 and 128 characters.'
      : 'Enter your password.');
  }
  return value;
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = await pbkdf2Async(password, salt, 310000, 64, 'sha512');
  return { salt, hash: hash.toString('hex') };
}

function sessionToken(request) {
  const cookies = request.headers.cookie || '';
  const cookie = cookies.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${sessionCookieName}=`));
  return cookie ? cookie.slice(sessionCookieName.length + 1) : '';
}

function sessionCookie(request, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' || request.headers['x-forwarded-proto'] === 'https'
    ? '; Secure'
    : '';
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${maxAge}${secure}`;
}

async function currentUser(request) {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const result = await pool.query(
    `SELECT users.id, COALESCE(profiles.name, users.name) AS name, users.email
     FROM sessions JOIN users ON users.id = sessions.user_id
     LEFT JOIN profiles ON profiles.user_id = users.id::text
     WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function requireUser(request) {
  const user = await currentUser(request);
  if (!user) throw new HttpError(401, 'Please sign in to continue.');
  return user;
}

async function createSession(request, userId, client = pool) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await client.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))`,
    [tokenHash, userId, sessionLifetimeSeconds]
  );
  return sessionCookie(request, token, sessionLifetimeSeconds);
}

async function handle(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const method = request.method;

    if (method === 'GET' && url.pathname === '/api/_healthcheck') {
      await pool.query('SELECT 1');
      sendJson(response, 200, { ok: true, app: 'AGRISENSE', runtime: 'Node.js', database: 'PostgreSQL' });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/session') {
      const user = await currentUser(request);
      sendJson(response, 200, {
        user: user ? { name: user.name, email: user.email } : null
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readJson(request);
      const name = requiredText(body.name, 100);
      const email = normalizedEmail(body.email);
      const password = validatePassword(body.password, true);
      const { salt, hash } = await hashPassword(password);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO users (id, email, password_salt, password_hash, name)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (email) DO NOTHING
           RETURNING id, name, email`,
          [randomUUID(), email, salt, hash, name]
        );
        if (!result.rows[0]) throw new HttpError(409, 'An account with this email already exists.');
        const user = result.rows[0];
        await client.query(
          `INSERT INTO profiles (user_id, name, county)
           VALUES ($1, $2, 'Kisii')`,
          [user.id, user.name]
        );
        const cookie = await createSession(request, user.id, client);
        await client.query('COMMIT');
        response.setHeader('Set-Cookie', cookie);
        sendJson(response, 201, { user: { name: user.name, email: user.email } });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(request);
      const email = normalizedEmail(body.email);
      const password = validatePassword(body.password, false);
      const result = await pool.query(
        `SELECT users.id, COALESCE(profiles.name, users.name) AS name, users.email,
                users.password_salt, users.password_hash
         FROM users LEFT JOIN profiles ON profiles.user_id = users.id::text
         WHERE users.email = $1`,
        [email]
      );
      const account = result.rows[0];
      const { hash } = await hashPassword(password, account?.password_salt || randomBytes(16).toString('hex'));
      const expectedHash = account?.password_hash || '0'.repeat(128);
      const valid = timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
      if (!account || !valid) throw new HttpError(401, 'Email or password is incorrect.');
      response.setHeader('Set-Cookie', await createSession(request, account.id));
      sendJson(response, 200, { user: { name: account.name, email: account.email } });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = sessionToken(request);
      if (token) {
        const tokenHash = createHash('sha256').update(token).digest('hex');
        await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
      }
      response.setHeader('Set-Cookie', sessionCookie(request, '', 0));
      sendJson(response, 200, { signedOut: true });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/profile') {
      const user = await requireUser(request);
      const result = await pool.query(
        `SELECT name, county, phone, farm_size AS "farmSize", crops,
                TO_CHAR(expected_harvest, 'YYYY-MM-DD') AS "expectedHarvest"
         FROM profiles WHERE user_id = $1`,
        [user.id]
      );
      sendJson(response, 200, { profile: result.rows[0] || null });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/profile') {
      const user = await requireUser(request);
      const body = await readJson(request);
      const profile = {
        name: requiredText(body.name, 100),
        county: requiredText(body.county, 80),
        phone: text(body.phone, 30),
        farmSize: text(body.farmSize, 30),
        crops: text(body.crops, 300),
        expectedHarvest: text(body.expectedHarvest, 10) || null
      };
      await pool.query(
        `INSERT INTO profiles (user_id, name, county, phone, farm_size, crops, expected_harvest)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           name = EXCLUDED.name,
           county = EXCLUDED.county,
           phone = EXCLUDED.phone,
           farm_size = EXCLUDED.farm_size,
           crops = EXCLUDED.crops,
           expected_harvest = EXCLUDED.expected_harvest,
           updated_at = NOW()`,
        [user.id, profile.name, profile.county, profile.phone, profile.farmSize, profile.crops, profile.expectedHarvest]
      );
      await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, profile.name]);
      sendJson(response, 200, { saved: true, profile });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/market-reports') {
      const user = await requireUser(request);
      const result = await pool.query(
        `SELECT id, crop, market, county, unit, price, reported_by AS "reportedBy",
                reporter_name AS "reporterName", reported_at AS "reportedAt", status
         FROM market_reports WHERE reported_by = $1
         ORDER BY reported_at DESC`,
        [user.id]
      );
      sendJson(response, 200, { items: result.rows });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/market-reports') {
      const user = await requireUser(request);
      const body = await readJson(request);
      const price = Number(body.price);
      const crop = requiredText(body.crop, 80);
      const market = requiredText(body.market, 80);
      const county = text(body.county, 80);
      const unit = requiredText(body.unit, 30);
      const reporterName = text(body.reporterName, 80) || 'Farmer';
      if (!Number.isFinite(price) || price <= 0) {
        throw new HttpError(400, 'Enter a valid price greater than zero.');
      }
      const result = await pool.query(
        `INSERT INTO market_reports
           (id, crop, market, county, unit, price, reported_by, reporter_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, status`,
        [randomUUID(), crop, market, county, unit, price, user.id, reporterName]
      );
      const report = result.rows[0];
      sendJson(response, 200, {
        submitted: true,
        status: report.status,
        reportId: report.id,
        message: 'Report submitted for verification.'
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/market-prices') {
      const result = await pool.query(
        `SELECT id, crop, market, county, unit, price, reported_by AS "reportedBy",
                reporter_name AS "reporterName", reported_at AS "reportedAt", status
         FROM market_reports WHERE status = 'verified'
         ORDER BY reported_at DESC`
      );
      sendJson(response, 200, { items: result.rows });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/forecast') {
      const body = await readJson(request);
      const crop = requiredText(body.crop, 80);
      const market = requiredText(body.market, 80);
      const currentPrice = Number(body.currentPrice);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new HttpError(400, 'Enter a valid current price greater than zero.');
      }
      const result = await pool.query(
        `SELECT COUNT(*)::integer AS count FROM market_reports
         WHERE status = 'verified' AND LOWER(crop) = LOWER($1) AND LOWER(market) = LOWER($2)`,
        [crop, market]
      );
      const period = text(body.period, 30) || '30 days';
      sendJson(response, 200, {
        analysis: `This is a cautious demo outlook for ${period}. No AI provider is configured, so no future numerical prices are generated. Compare recent quotations from several nearby buyers and factor in transport, grading, packaging and storage costs.`,
        verifiedObservations: result.rows[0].count
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/notify-self') {
      const body = await readJson(request);
      sendJson(response, 200, {
        sent: true,
        title: text(body.title, 80) || 'AGRISENSE update'
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/weather') {
      const county = url.searchParams.get('county') || 'Kisii';
      const coordinates = counties[county];
      if (!coordinates) throw new HttpError(400, 'Choose a supported Kenyan county.');

      const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
      weatherUrl.search = new URLSearchParams({
        latitude: String(coordinates[0]),
        longitude: String(coordinates[1]),
        current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
        forecast_days: '7',
        timezone: 'Africa/Nairobi'
      });
      let providerResponse;
      try {
        const result = await fetch(weatherUrl, { signal: AbortSignal.timeout(15000) });
        if (!result.ok) throw new Error(`Open-Meteo returned HTTP ${result.status}.`);
        providerResponse = await result.json();
      } catch (error) {
        console.error('Weather provider request failed:', error);
        throw new HttpError(503, 'Weather provider unavailable.');
      }
      sendJson(response, 200, {
        county,
        provider: 'Open-Meteo',
        fetchedAt: new Date().toISOString(),
        current: providerResponse.current,
        daily: providerResponse.daily
      });
      return;
    }

    if ((method === 'GET' || method === 'HEAD')
      && url.pathname !== '/api'
      && !url.pathname.startsWith('/api/')) {
      await serveFrontend(request, response, url.pathname);
      return;
    }

    sendJson(response, 404, { message: 'Not found.' });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error(error);
    if (!response.headersSent) {
      sendJson(response, status, {
        message: status === 500 ? 'Internal server error.' : error.message
      });
    } else {
      response.destroy(error);
    }
  }
}

try {
  await migrationPool.query(await readFile(schemaPath, 'utf8'));
  await pool.query('SELECT 1');
} catch (error) {
  console.error('Could not initialize PostgreSQL:', error);
  await pool.end();
  process.exitCode = 1;
  throw error;
} finally {
  await migrationPool.end();
}

const server = createServer(handle);
server.listen(port, () => {
  console.log(`AGRISENSE Node.js backend listening at http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
