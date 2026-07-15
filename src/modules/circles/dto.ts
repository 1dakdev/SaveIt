import { IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';

export enum FrequencyDto {
  weekly = 'weekly',
  monthly = 'monthly',
}

export class CreateCircleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // Contribution amount per period, in minor units (cents).
  @IsInt()
  @Min(1)
  amount!: number;

  @IsEnum(FrequencyDto)
  frequency!: FrequencyDto;
}

export class InviteDto {
  @IsString()
  userId!: string;
}
