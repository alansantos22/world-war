import {
  IsEmail,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_ ]+$/, {
    message: 'Nome do cidadao contem caracteres invalidos',
  })
  citizenName: string;

  @IsInt()
  countryId: number;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
