import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// DTOs (Data Transfer Objects) describe the request body. The global ValidationPipe
// rejects any body that breaks these rules with a 400, before the controller runs.

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128) // caps hashing cost so a huge password cannot slow the server down
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
