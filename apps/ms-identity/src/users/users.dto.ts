import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ROLES, type InviteUserRequest, type Role, type UpdateUserRequest } from '@cka/contracts';

export class InviteUserDto implements InviteUserRequest {
  @ApiProperty() @IsEmail() @MaxLength(254)
  email: string;

  @ApiProperty() @IsString() @Length(1, 100)
  displayName: string;

  @ApiProperty({ enum: ROLES }) @IsIn(ROLES as unknown as string[])
  role: Role;
}

export class UpdateUserDto implements UpdateUserRequest {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100)
  displayName?: string;

  @ApiPropertyOptional({ enum: ROLES }) @IsOptional() @IsIn(ROLES as unknown as string[])
  role?: Role;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] }) @IsOptional() @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
