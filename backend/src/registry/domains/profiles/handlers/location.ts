import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parseOptionalNumber } from '../../../../lib/http/parse.js';
import type { RouteDef } from '../../../../registry/types.js';

const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org';
const NOMINATIM_EMAIL = process.env.NOMINATIM_EMAIL ?? 'dev@example.com';

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
};

type NominatimReverseResponse = {
  address?: NominatimAddress;
};

export const reverseGeocodeRoute: RouteDef = {
  id: 'profiles.POST./profiles/location/reverse',
  method: 'POST',
  path: '/profiles/location/reverse',
  auth: Auth.user(),
  summary: 'Reverse geocode coordinates for location display',
  tags: ['profiles'],
  handler: async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const latParsed = parseOptionalNumber(body.lat, 'lat');
    if (!latParsed.ok) return json(res, { error: latParsed.error }, 400);
    const lngParsed = parseOptionalNumber(body.lng, 'lng');
    if (!lngParsed.ok) return json(res, { error: lngParsed.error }, 400);

    if (latParsed.value === undefined || lngParsed.value === undefined) {
      return json(res, { error: 'lat and lng are required' }, 400);
    }

    const lat = Number(latParsed.value);
    const lng = Number(lngParsed.value);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return json(res, { error: 'lat must be between -90 and 90' }, 400);
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      return json(res, { error: 'lng must be between -180 and 180' }, 400);
    }

    const url = new URL('/reverse', NOMINATIM_BASE_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('email', NOMINATIM_EMAIL);

    const response = await fetch(url.toString(), {
      headers: {
        'user-agent': 'internet-dating-dev/1.0'
      }
    });

    if (!response.ok) {
      const message = await response.text().catch(() => 'Failed to reverse geocode');
      return json(res, { error: message }, 502);
    }

    const data = (await response.json().catch(() => null)) as NominatimReverseResponse | null;
    const address = data?.address ?? {};
    const city = address.city ?? address.town ?? address.village ?? address.county ?? null;
    const state = address.state ?? null;
    const country = address.country ?? null;

    const locationText = city && state
      ? `${city}, ${state}`
      : city ?? state ?? country ?? null;

    return json(res, {
      locationText,
      city,
      state,
      country,
      lat,
      lng
    });
  }
};
