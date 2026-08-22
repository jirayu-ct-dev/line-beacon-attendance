import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { hash as argonHash, verify as argonVerify } from 'argon2'
import { createHash, randomBytes } from 'node:crypto'
import { User, UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { LoginDto } from './dto/login.dto'
import { UserProfileDto } from './dto/user-profile.dto'
import { parseDurationMs } from './parse-duration'

/** Tokens issued by login/refresh — the controller turns them into httpOnly cookies. */
export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessMaxAgeMs: number
  refreshMaxAgeMs: number
}

const INVALID_CREDENTIALS = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'

@Injectable()
export class AuthService {
  private readonly accessMaxAgeMs: number
  private readonly refreshMaxAgeMs: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    // Defaults per design doc §5.2: access 15 min, refresh 7 days
    this.accessMaxAgeMs = parseDurationMs(configService.get<string>('JWT_EXPIRES_IN', '15m')!, 15 * 60_000)
    this.refreshMaxAgeMs = parseDurationMs(configService.get<string>('REFRESH_EXPIRES_IN', '7d')!, 7 * 86_400_000)
  }

  async login(dto: LoginDto): Promise<{ user: UserProfileDto } & TokenPair> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username_or_email }, { email: dto.username_or_email }] },
    })
    // Same generic message for unknown user / wrong password / inactive user (no enumeration)
    if (!user || user.status !== 'ACTIVE' || !(await argonVerify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }
    return this.issueTokens(user)
  }

  /**
   * Rotating refresh (design §5.2): look the row up by SHA-256(token), verify the
   * argon2 hash, revoke the old row and issue a fresh pair.
   *
   * Reuse detection: a revoked/expired token presented again is simply rejected —
   * the matched row is already revoked, so nothing more to do. Single-token
   * scheme per login, no family tracking (kept simple by design).
   */
  async refresh(token: string | undefined): Promise<{ user: UserProfileDto } & TokenPair> {
    if (!token) throw new UnauthorizedException('ไม่พบ refresh token กรุณาเข้าสู่ระบบอีกครั้ง')

    const tokenLookup = sha256Hex(token)
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenLookup } })
    if (!stored) throw new UnauthorizedException('refresh token ไม่ถูกต้อง')

    if (stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('refresh token ถูกเพิกถอนหรือหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง')
    }
    if (!(await argonVerify(stored.tokenHash, token))) {
      throw new UnauthorizedException('refresh token ไม่ถูกต้อง')
    }

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } })
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }
    return this.issueTokens(user)
  }

  /** Idempotent: revokes the presented refresh token if it is still active. */
  async logout(token: string | undefined): Promise<void> {
    if (!token) return
    await this.prisma.refreshToken.updateMany({
      where: { tokenLookup: sha256Hex(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
    }
    return toProfile(user)
  }

  private async issueTokens(user: User & { role: UserRole }): Promise<{ user: UserProfileDto } & TokenPair> {
    const accessToken = await this.jwtService.signAsync({ sub: user.id, role: user.role })
    // Opaque token: 48 random bytes as hex (96 chars). Stored only as hashes —
    // sha256 for lookup + argon2 for verification (see schema comment).
    const refreshToken = randomBytes(48).toString('hex')

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenLookup: sha256Hex(refreshToken),
        tokenHash: await argonHash(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshMaxAgeMs),
      },
    })

    return {
      user: toProfile(user),
      accessToken,
      refreshToken,
      accessMaxAgeMs: this.accessMaxAgeMs,
      refreshMaxAgeMs: this.refreshMaxAgeMs,
    }
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function toProfile(user: User): UserProfileDto {
  return { id: user.id, email: user.email, username: user.username, role: user.role }
}
