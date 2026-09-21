import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Staff } from '../models/Staff.js';

const findUserSafely = async (identifier?: string) => {
  if (!identifier) return null;
  const str = identifier.trim();
  if (mongoose.Types.ObjectId.isValid(str)) {
    const byId = (await User.findById(str)) || (await Staff.findById(str));
    if (byId) return byId;
  }
  const byGuestId = await User.findOne({ guestDeviceId: str });
  if (byGuestId) return byGuestId;

  const byEmail = (await User.findOne({ email: str.toLowerCase() })) || (await Staff.findOne({ email: str.toLowerCase() }));
  return byEmail;
};

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * POST /api/auth/guest-session
   * Provisions or resumes a guest account for device UUID
   */
  fastify.post('/auth/guest-session', async (request, reply) => {
    const { deviceId, name } = request.body as {
      deviceId?: string;
      name?: string;
    };

    const guestId = deviceId || `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    let user = await User.findOne({ guestDeviceId: guestId });
    if (!user) {
      user = new User({
        isGuest: true,
        guestDeviceId: guestId,
        name: name || `Guest`,
        settings: {
          checkInIntervalMinutes: 5,
          timeoutDurationSeconds: 60,
          callHandlingPreference: 'standard_ring',
          defaultLandingTab: 'safety_mode',
        },
      });
      await user.save();
    }

    const token = fastify.jwt.sign({
      id: user._id.toString(),
      isGuest: true,
      role: 'citizen',
    });

    return reply.status(200).send({
      token,
      user: {
        id: user._id,
        name: user.name,
        isGuest: user.isGuest,
        guestDeviceId: user.guestDeviceId,
        settings: user.settings,
        emergencyContacts: user.emergencyContacts,
        communityId: user.communityId,
        hasSafetyPin: Boolean((user as any).safetyPinHash),
      },
    });
  });

  /**
   * POST /api/auth/register
   * Registers a full citizen account
   */
  fastify.post('/auth/register', async (request, reply) => {
    const { email, password, name, phone, emergencyContacts } = request.body as {
      email?: string;
      password?: string;
      name?: string;
      phone?: string;
      emergencyContacts?: Array<{ name: string; phone: string; relationship: string }>;
    };

    if (!email || !password || !name) {
      return reply.status(400).send({ error: 'Email, password, and name are required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && !existingUser.isGuest) {
      return reply.status(409).send({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let user: any;
    if (existingUser && existingUser.isGuest) {
      // Upgrade existing guest user
      existingUser.isGuest = false;
      existingUser.name = name;
      existingUser.email = email.toLowerCase();
      existingUser.phone = phone || existingUser.phone;
      existingUser.passwordHash = passwordHash;
      if (emergencyContacts) existingUser.emergencyContacts = emergencyContacts;
      user = await existingUser.save();
    } else {
      user = new User({
        isGuest: false,
        name,
        email: email.toLowerCase(),
        phone: phone || '',
        passwordHash,
        emergencyContacts: emergencyContacts || [],
        settings: {
          checkInIntervalMinutes: 5,
          timeoutDurationSeconds: 60,
          callHandlingPreference: 'standard_ring',
          defaultLandingTab: 'safety_mode',
        },
      });
      await user.save();
    }

    const token = fastify.jwt.sign({
      id: user._id.toString(),
      email: user.email,
      role: 'citizen',
    });

    return reply.status(201).send({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isGuest: user.isGuest,
        settings: user.settings,
        emergencyContacts: user.emergencyContacts,
        communityId: user.communityId,
        hasSafetyPin: Boolean((user as any).safetyPinHash),
      },
    });
  });

  /**
   * POST /api/auth/login
   * Authenticates citizen or staff member
   */
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check Staff database first
    const staff = await Staff.findOne({ email: normalizedEmail });
    if (staff) {
      const match = await bcrypt.compare(password, staff.passwordHash);
      if (match) {
        staff.lastActiveAt = new Date();
        await staff.save();

        const token = fastify.jwt.sign({
          id: staff._id.toString(),
          email: staff.email,
          role: staff.role,
          isStaff: true,
        });

        return reply.send({
          token,
          isStaff: true,
          user: {
            id: staff._id,
            name: staff.name,
            email: staff.email,
            phone: staff.phone,
            role: staff.role,
            status: staff.status,
            countryCode: staff.countryCode,
            assignedJurisdiction: staff.assignedJurisdiction,
          },
        });
      }
    }

    // 2. Check Citizen database
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }

    const userMatch = await bcrypt.compare(password, user.passwordHash);
    if (!userMatch) {
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }

    const token = fastify.jwt.sign({
      id: user._id.toString(),
      email: user.email,
      role: 'citizen',
    });

    return reply.send({
      token,
      isStaff: false,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isGuest: user.isGuest,
        settings: user.settings,
        emergencyContacts: user.emergencyContacts,
        communityId: user.communityId,
        hasSafetyPin: Boolean((user as any).safetyPinHash),
      },
    });
  });

  /**
   * GET /api/auth/me
   */
  fastify.get('/auth/me', async (request, reply) => {
    try {
      const decoded = await request.jwtVerify() as any;
      if (decoded.isStaff) {
        const staff = await Staff.findById(decoded.id);
        if (!staff) return reply.status(404).send({ error: 'Staff account not found' });
        return reply.send({ isStaff: true, user: staff });
      } else {
        const user = await User.findById(decoded.id);
        if (!user) return reply.status(404).send({ error: 'User not found' });
        return reply.send({ isStaff: false, user });
      }
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized token' });
    }
  });

  /**
   * PATCH & POST /api/auth/settings
   */
  const handleUpdateSettings = async (request: any, reply: any) => {
    try {
      const { settings, emergencyContacts, communityId, userId, email } = request.body as any;

      let user = null;
      try {
        const decoded = await request.jwtVerify() as any;
        if (decoded?.id) {
          user = await findUserSafely(decoded.id);
        }
      } catch (_) {}

      if (!user && userId) {
        user = await findUserSafely(userId);
      }
      if (!user && email) {
        user = await findUserSafely(email);
      }

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const updateFields: any = {};
      if (settings) {
        updateFields.settings = {
          checkInIntervalMinutes: settings.checkInIntervalMinutes ?? user.settings?.checkInIntervalMinutes ?? 5,
          timeoutDurationSeconds: settings.timeoutDurationSeconds ?? user.settings?.timeoutDurationSeconds ?? 60,
          callHandlingPreference: settings.callHandlingPreference ?? user.settings?.callHandlingPreference ?? 'standard_ring',
          defaultLandingTab: settings.defaultLandingTab ?? user.settings?.defaultLandingTab ?? 'safety_mode',
        };
      }
      if (emergencyContacts) {
        updateFields.emergencyContacts = emergencyContacts;
      }
      if (communityId) {
        updateFields.communityId = communityId;
      }

      const updated = await User.findByIdAndUpdate(
        user._id,
        { $set: updateFields },
        { new: true, runValidators: false }
      );

      return reply.send({
        success: true,
        settings: updated?.settings || user.settings,
        emergencyContacts: updated?.emergencyContacts || user.emergencyContacts,
        communityId: updated?.communityId || user.communityId,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to update settings' });
    }
  };
  fastify.patch('/auth/settings', handleUpdateSettings);
  fastify.post('/auth/settings', handleUpdateSettings);

  /**
   * PATCH & POST /api/auth/profile
   * Updates citizen name and profile info
   */
  const handleUpdateProfile = async (request: any, reply: any) => {
    try {
      const { name, phone, email, userId } = request.body as {
        name?: string;
        phone?: string;
        email?: string;
        userId?: string;
      };

      let user = null;
      try {
        const decoded = await request.jwtVerify() as any;
        if (decoded?.id) {
          user = await findUserSafely(decoded.id);
        }
      } catch (_) {}

      if (!user && userId) {
        user = await findUserSafely(userId);
      }
      if (!user && email) {
        user = await findUserSafely(email);
      }

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const updateFields: any = {};
      if (name && name.trim()) updateFields.name = name.trim();
      if (phone !== undefined) updateFields.phone = phone.trim();
      if (email && email.trim()) updateFields.email = email.toLowerCase().trim();

      const updatedUser = (await User.findByIdAndUpdate(
        user._id,
        { $set: updateFields },
        { new: true, runValidators: false }
      )) || (await Staff.findByIdAndUpdate(
        user._id,
        { $set: updateFields },
        { new: true, runValidators: false }
      )) || user;

      return reply.send({
        success: true,
        user: {
          id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          isGuest: (updatedUser as any).isGuest ?? false,
          settings: (updatedUser as any).settings,
          emergencyContacts: (updatedUser as any).emergencyContacts,
          communityId: (updatedUser as any).communityId,
          hasSafetyPin: Boolean((updatedUser as any).safetyPinHash),
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to update profile' });
    }
  };
  fastify.patch('/auth/profile', handleUpdateProfile);
  fastify.post('/auth/profile', handleUpdateProfile);

  /**
   * POST /api/auth/change-password
   * Changes user password
   */
  fastify.post('/auth/change-password', async (request, reply) => {
    try {
      const { currentPassword, newPassword, email, userId } = request.body as {
        currentPassword?: string;
        newPassword?: string;
        email?: string;
        userId?: string;
      };

      if (!newPassword || newPassword.length < 6) {
        return reply.status(400).send({ error: 'New password must be at least 6 characters.' });
      }

      let user = null;
      try {
        const decoded = await request.jwtVerify() as any;
        if (decoded?.id) {
          user = await findUserSafely(decoded.id);
        }
      } catch (_) {}

      if (!user && userId) {
        user = await findUserSafely(userId);
      }
      if (!user && email) {
        user = await findUserSafely(email);
      }

      if (!user) {
        return reply.status(404).send({ error: 'User account not found.' });
      }

      if (user.passwordHash && currentPassword) {
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
          return reply.status(401).send({ error: 'Current password is incorrect.' });
        }
      }

      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(newPassword, salt);
      user.isGuest = false;
      await user.save();

      return reply.send({ success: true, message: 'Password updated successfully.' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to change password.' });
    }
  });

  /**
   * POST /api/users/device-token
   * Pillar 3: Registers device FCM push token, live GPS coordinates, and communityId
   */
  fastify.post('/users/device-token', async (request, reply) => {
    const { userId, fcmToken, lat, lng, lastKnownLocation, communityId } = request.body as {
      userId?: string;
      fcmToken?: string;
      lat?: number;
      lng?: number;
      lastKnownLocation?: { lat: number; lng: number } | [number, number];
      communityId?: string;
    };

    if (!userId) {
      return reply.status(400).send({ error: 'userId is required' });
    }

    const latitude = lat ?? (Array.isArray(lastKnownLocation) ? lastKnownLocation[1] : lastKnownLocation?.lat);
    const longitude = lng ?? (Array.isArray(lastKnownLocation) ? lastKnownLocation[0] : lastKnownLocation?.lng);

    const user = await findUserSafely(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (fcmToken) user.fcmToken = fcmToken;
    if (communityId) user.communityId = communityId;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      user.lastKnownLocation = {
        type: 'Point',
        coordinates: [longitude, latitude],
      };
    }

    await user.save();

    return reply.send({
      success: true,
      message: 'FCM device token and location registered successfully',
      user: {
        id: user._id,
        hasFcmToken: Boolean(user.fcmToken),
        communityId: user.communityId,
      },
    });
  });

  /**
   * POST /api/auth/safety-pin (and /api/users/safety-pin)
   * Sets or updates user's 4-digit Safety PIN
   */
  const handleSetSafetyPin = async (request: any, reply: any) => {
    try {
      const { pin, userId } = request.body as { pin?: string; userId?: string };
      const trimmedPin = (pin || '').trim();

      if (!trimmedPin || !/^\d{4}$/.test(trimmedPin)) {
        return reply.status(400).send({ error: 'Safety PIN must be a 4-digit numeric code.' });
      }

      let user = null;
      try {
        const decoded = (await request.jwtVerify()) as any;
        if (decoded?.id) {
          user = await findUserSafely(decoded.id);
        }
      } catch (_) {}

      if (!user && userId) {
        user = await findUserSafely(userId);
      }

      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }

      const salt = await bcrypt.genSalt(10);
      const pinHash = await bcrypt.hash(trimmedPin, salt);
      (user as any).safetyPinHash = pinHash;
      await user.save();

      return reply.send({
        success: true,
        hasSafetyPin: true,
        message: 'Safety PIN saved successfully.',
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to set safety PIN.' });
    }
  };
  fastify.post('/auth/safety-pin', handleSetSafetyPin);
  fastify.post('/users/safety-pin', handleSetSafetyPin);

  /**
   * POST /api/auth/safety-pin/verify (and /api/users/safety-pin/verify)
   * Verifies user's 4-digit Safety PIN for emergency deactivation
   */
  const handleVerifySafetyPin = async (request: any, reply: any) => {
    try {
      const { pin, userId } = request.body as { pin?: string; userId?: string };
      const trimmedPin = (pin || '').trim();

      if (!trimmedPin || !/^\d{4}$/.test(trimmedPin)) {
        return reply.status(400).send({ error: 'A 4-digit PIN is required.' });
      }

      let user = null;
      try {
        const decoded = (await request.jwtVerify()) as any;
        if (decoded?.id) {
          user = await findUserSafely(decoded.id);
        }
      } catch (_) {}

      if (!user && userId) {
        user = await findUserSafely(userId);
      }

      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }

      if (!(user as any).safetyPinHash) {
        return reply.status(400).send({
          error: 'No safety PIN has been configured for this account.',
          hasSafetyPin: false,
          valid: false,
        });
      }

      const isValid = await bcrypt.compare(trimmedPin, (user as any).safetyPinHash);
      return reply.send({
        success: true,
        valid: isValid,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to verify safety PIN.' });
    }
  };
  fastify.post('/auth/safety-pin/verify', handleVerifySafetyPin);
  fastify.post('/users/safety-pin/verify', handleVerifySafetyPin);

  /**
   * POST /api/auth/safety-pin/change (and /api/users/safety-pin/change)
   * Changes user's 4-digit Safety PIN (validates current PIN first if exists)
   */
  const handleChangeSafetyPin = async (request: any, reply: any) => {
    try {
      const { currentPin, newPin, userId } = request.body as {
        currentPin?: string;
        newPin?: string;
        userId?: string;
      };
      const trimmedNewPin = (newPin || '').trim();
      const trimmedCurrentPin = (currentPin || '').trim();

      if (!trimmedNewPin || !/^\d{4}$/.test(trimmedNewPin)) {
        return reply.status(400).send({ error: 'New PIN must be a 4-digit numeric code.' });
      }

      let user = null;
      try {
        const decoded = (await request.jwtVerify()) as any;
        if (decoded?.id) {
          user = await findUserSafely(decoded.id);
        }
      } catch (_) {}

      if (!user && userId) {
        user = await findUserSafely(userId);
      }

      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }

      if ((user as any).safetyPinHash) {
        if (!trimmedCurrentPin) {
          return reply.status(400).send({ error: 'Current PIN is required to change PIN.' });
        }
        const isMatch = await bcrypt.compare(trimmedCurrentPin, (user as any).safetyPinHash);
        if (!isMatch) {
          return reply.status(401).send({ error: 'Current safety PIN is incorrect.' });
        }
      }

      const salt = await bcrypt.genSalt(10);
      const pinHash = await bcrypt.hash(trimmedNewPin, salt);
      (user as any).safetyPinHash = pinHash;
      await user.save();

      return reply.send({
        success: true,
        hasSafetyPin: true,
        message: 'Safety PIN changed successfully.',
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to change safety PIN.' });
    }
  };
  fastify.post('/auth/safety-pin/change', handleChangeSafetyPin);
  fastify.post('/users/safety-pin/change', handleChangeSafetyPin);
};
