import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwksController } from './jwks.controller';
import { KeysService } from './keys.service';
import { OneTimeTokensService } from './one-time-tokens.service';
import { PasswordService } from './password.service';
import { Session } from './session.entity';
import { SessionsService } from './sessions.service';
import { UserToken } from './user-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Session, UserToken])],
  controllers: [AuthController, JwksController],
  providers: [KeysService, PasswordService, SessionsService, OneTimeTokensService, AuthService],
  exports: [KeysService, PasswordService, SessionsService, OneTimeTokensService, AuthService],
})
export class AuthModule {}
