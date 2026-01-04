import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parseOptionalBoolean, parseOptionalDate, parseOptionalNumber, parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../../lib/http/parse.js';
import { MediaError } from '../../../../services/media/mediaService.js';
import type { Gender, DatingIntent } from '@prisma/client';
import type { RouteDef } from '../../../../registry/types.js';
import { updateProfile, ValidationError } from '../services/updateProfileService.js';

export const updateProfileRoute: RouteDef = {
  id: 'profiles.PATCH./profiles/:userId',
  method: 'PATCH',
  path: '/profiles/:userId',
  auth: Auth.owner('userId'),
  summary: 'Update own profile',
  tags: ['profiles'],
  handler: async (req, res) => {
    const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
    if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
    const userId = userParsed.value;
    
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { displayName, bio, birthdate, locationText, lat, lng, gender, intent, isVisible } = body;
    
    const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatarMediaId');
    const hasHero = Object.prototype.hasOwnProperty.call(body, 'heroMediaId');
    
    const avatarParsed = hasAvatar ? parseOptionalPositiveBigInt(body.avatarMediaId, 'avatarMediaId') : { ok: true as const, value: undefined };
    if (!avatarParsed.ok) return json(res, { error: avatarParsed.error }, 400);
    
    const heroParsed = hasHero ? parseOptionalPositiveBigInt(body.heroMediaId, 'heroMediaId') : { ok: true as const, value: undefined };
    if (!heroParsed.ok) return json(res, { error: heroParsed.error }, 400);

    const birthdateParsed = parseOptionalDate(birthdate, 'birthdate');
    if (!birthdateParsed.ok) return json(res, { error: birthdateParsed.error }, 400);
    
    const latParsed = parseOptionalNumber(lat, 'lat');
    if (!latParsed.ok) return json(res, { error: latParsed.error }, 400);
    
    const lngParsed = parseOptionalNumber(lng, 'lng');
    if (!lngParsed.ok) return json(res, { error: lngParsed.error }, 400);
    
    const visibleParsed = parseOptionalBoolean(isVisible, 'isVisible');
    if (!visibleParsed.ok) return json(res, { error: visibleParsed.error }, 400);

    try {
      const updated = await updateProfile(userId, {
        displayName: displayName as string | null | undefined,
        bio: bio as string | null | undefined,
        birthdate: birthdateParsed.value,
        locationText: locationText as string | null | undefined,
        lat: latParsed.value,
        lng: lngParsed.value,
        gender: gender as Gender | undefined,
        intent: intent as DatingIntent | undefined,
        isVisible: visibleParsed.value,
        ...(hasAvatar ? { avatarMediaId: avatarParsed.value ?? null } : {}),
        ...(hasHero ? { heroMediaId: heroParsed.value ?? null } : {})
      });

      return json(res, updated);
    } catch (err) {
      if (err instanceof MediaError) {
        return json(res, { error: err.message }, (err as MediaError & { status: number }).status);
      }
      if (err instanceof ValidationError) {
        return json(res, { error: err.message }, 400);
      }
      throw err;
    }
  }
};
