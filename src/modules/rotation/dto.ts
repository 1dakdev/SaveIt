import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class ProposeOrderDto {
  // Ordered list of userIds = payout sequence. Omit to order by join time.
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  order?: string[];
}

export enum VoteValueDto {
  approve = 'approve',
  decline = 'decline',
}

export class VoteDto {
  @IsEnum(VoteValueDto)
  value!: VoteValueDto;
}

export class SwapRequestDto {
  // Membership id of the counterparty to trade positions with.
  @IsString()
  toMembershipId!: string;
}
