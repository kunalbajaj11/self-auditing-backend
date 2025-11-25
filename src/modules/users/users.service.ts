import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeUserStatusDto } from './dto/change-status.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { Organization } from '../../entities/organization.entity';
import { UserStatus } from '../../common/enums/user-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { hashPassword } from '../../utils/password.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
      relations: ['organization'],
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['organization'],
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async findAllByOrganization(
    organizationId: string,
    options?: { includeStatuses?: UserStatus[] },
  ): Promise<User[]> {
    const where: FindOptionsWhere<User> = {
      organization: { id: organizationId },
    };
    if (options?.includeStatuses?.length) {
      where.status =
        options.includeStatuses.length === 1
          ? options.includeStatuses[0]
          : (In(options.includeStatuses) as any);
    }
    return this.usersRepository.find({
      where,
      relations: ['organization'],
      order: { name: 'ASC' },
    });
  }

  async createSuperAdmin(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }
    const user = this.usersRepository.create({
      ...dto,
      email: dto.email.toLowerCase(),
      passwordHash: await hashPassword(dto.password),
      role: UserRole.SUPERADMIN,
      organization: null,
    });
    return this.usersRepository.save(user);
  }

  async createForOrganization(
    organizationId: string,
    dto: CreateUserDto,
    roleScope: UserRole[],
  ): Promise<User> {
    if (!roleScope.includes(dto.role)) {
      throw new ConflictException('Invalid role for the current operation');
    }
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }

    // Check user limit for Standard license (max 5 users)
    if (organization.planType === PlanType.STANDARD) {
      const userCount = await this.usersRepository.count({
        where: { organization: { id: organizationId } },
      });
      if (userCount >= 5) {
        throw new BadRequestException(
          'Standard license allows maximum 5 users. Please upgrade to Enterprise for unlimited users.',
        );
      }
    }
    // Enterprise license has no limit

    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const user = this.usersRepository.create({
      ...dto,
      email: dto.email.toLowerCase(),
      passwordHash: await hashPassword(dto.password),
      organization,
    });
    return this.usersRepository.save(user);
  }

  async updateUser(
    userId: string,
    organizationId: string,
    dto: UpdateUserDto,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, organization: { id: organizationId } },
      relations: ['organization'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email !== user.email) {
      const exists = await this.findByEmail(dto.email);
      if (exists && exists.id !== user.id) {
        throw new ConflictException('Email already taken');
      }
      user.email = dto.email.toLowerCase();
    }

    if (dto.name) {
      user.name = dto.name;
    }

    if (dto.phone !== undefined) {
      user.phone = dto.phone;
    }

    if (dto.role) {
      user.role = dto.role;
    }

    return this.usersRepository.save(user);
  }

  async changeStatus(
    userId: string,
    organizationId: string,
    dto: ChangeUserStatusDto,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, organization: { id: organizationId } },
      relations: ['organization'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.status = dto.status;
    return this.usersRepository.save(user);
  }

  async setRefreshToken(userId: string, tokenHash: string): Promise<void> {
    await this.usersRepository.update(userId, {
      refreshTokenHash: tokenHash,
    });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { refreshTokenHash: null });
  }

  async recordLogin(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      lastLogin: new Date(),
    });
  }

  async getUserLimitInfo(organizationId: string): Promise<{
    currentCount: number;
    maxUsers: number | null;
    planType: PlanType;
  }> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }

    const currentCount = await this.usersRepository.count({
      where: { organization: { id: organizationId } },
    });

    const maxUsers = organization.planType === PlanType.STANDARD ? 5 : null; // null means unlimited

    return {
      currentCount,
      maxUsers,
      planType: organization.planType,
    };
  }
}
