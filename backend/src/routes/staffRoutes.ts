import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { Staff } from '../models/Staff.js';

export const staffRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /api/staff
   */
  fastify.get('/staff', async (request, reply) => {
    const { role, status, countryCode } = request.query as any;

    const filter: any = {};
    if (role && role !== 'ALL') filter.role = role;
    if (status && status !== 'ALL') filter.status = status;
    if (countryCode && countryCode !== 'ALL') filter.countryCode = countryCode;

    const staffList = await Staff.find(filter).select('-passwordHash').sort({ createdAt: -1 });
    return reply.send(staffList);
  });

  /**
   * POST /api/staff
   */
  fastify.post('/staff', async (request, reply) => {
    const { name, email, phone, password, role, countryCode, assignedJurisdiction } = request.body as any;

    if (!name || !email || !password) {
      return reply.status(400).send({ error: 'Name, email, and password are required' });
    }

    const existing = await Staff.findOne({ email: email.toLowerCase() });
    if (existing) {
      return reply.status(409).send({ error: 'Staff member with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const staff = new Staff({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      passwordHash,
      role: role || 'dispatch_officer',
      status: 'active',
      countryCode: countryCode || 'ALL',
      assignedJurisdiction: assignedJurisdiction || 'Global Command',
      lastActiveAt: new Date(),
    });

    await staff.save();
    return reply.status(201).send({
      id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      status: staff.status,
      countryCode: staff.countryCode,
      assignedJurisdiction: staff.assignedJurisdiction,
    });
  });

  /**
   * PATCH /api/staff/:id/status
   */
  fastify.patch('/staff/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, role, assignedJurisdiction } = request.body as any;

    const staff = await Staff.findById(id);
    if (!staff) {
      return reply.status(404).send({ error: 'Staff member not found' });
    }

    if (status) staff.status = status;
    if (role) staff.role = role;
    if (assignedJurisdiction) staff.assignedJurisdiction = assignedJurisdiction;

    await staff.save();
    return reply.send({
      id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      status: staff.status,
      assignedJurisdiction: staff.assignedJurisdiction,
    });
  });

  /**
   * DELETE /api/staff/:id
   */
  fastify.delete('/staff/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const staff = await Staff.findByIdAndDelete(id);
    if (!staff) {
      return reply.status(404).send({ error: 'Staff member not found' });
    }
    return reply.send({ success: true, message: 'Staff member removed successfully' });
  });
};
