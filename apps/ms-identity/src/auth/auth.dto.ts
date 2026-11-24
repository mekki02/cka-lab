import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type AcceptInviteRequest,
  type ChangePasswordRequest,
  type LoginRequest,
  type ResetPasswordRequest,
} from '@cka/contracts';

const PASSWORD_RULE = `between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`;

export class LoginDto implements LoginRequest {
  @ApiProperty() @IsEmail() @MaxLength(254)
  email: string;

  // Not length-checked against the policy: an old password that predates a
  // policy change must still be able to log in.
  @ApiProperty() @IsString() @Length(1, PASSWORD_MAX_LENGTH)
  password: string;
}

export class AcceptInviteDto implements AcceptInviteRequest {
  @ApiProperty() @IsString() @Length(20, 200)
  token: string;

  @ApiProperty({ description: PASSWORD_RULE })
  @IsString() @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, { message: `password must be ${PASSWORD_RULE}` })
  password: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100)
  displayName?: string;
}

export class ResetPasswordDto implements ResetPasswordRequest {
  @ApiProperty() @IsString() @Length(20, 200)
  token: string;

  @ApiProperty({ description: PASSWORD_RULE })
  @IsString() @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, { message: `password must be ${PASSWORD_RULE}` })
  password: string;
}

export class ChangePasswordDto implements ChangePasswordRequest {
  @ApiProperty() @IsString() @Length(1, PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @ApiProperty({ description: PASSWORD_RULE })
  @IsString() @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, { message: `newPassword must be ${PASSWORD_RULE}` })
  newPassword: string;
}
