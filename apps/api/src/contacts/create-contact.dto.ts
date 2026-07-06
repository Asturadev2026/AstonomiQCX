import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONTACT_SOURCES, CUSTOMER_SEGMENTS, CUSTOMER_TYPES } from '@aq/shared';
import type {
  ContactConsentDto,
  CreateContactDto as CreateContactDtoShape,
  CreateContactOrderDto,
} from '@aq/shared';

/**
 * class-validator mirror of @aq/shared's CreateContactDto (Guide §10 pattern —
 * the shared interface is the wire contract; this class is what ValidationPipe
 * needs to actually enforce it at the boundary).
 */
export class ContactConsentInput implements ContactConsentDto {
  @IsBoolean() whatsapp!: boolean;
  @IsBoolean() sms!: boolean;
  @IsBoolean() email!: boolean;
  @IsBoolean() call!: boolean;
}

export class CreateContactOrderInput implements CreateContactOrderDto {
  @IsString() product!: string;
  @IsOptional() @IsString() orderRef?: string;
  @IsOptional() @IsString() purchaseDate?: string;
  @IsNumber() @Min(0) qty!: number;
  @IsNumber() @Min(0) amount!: number;
}

export class CreateContactDto implements CreateContactDtoShape {
  @IsIn(CUSTOMER_TYPES) customerType!: CreateContactDtoShape['customerType'];
  @IsString() name!: string;
  @IsString() @Length(10, 10) mobile!: string;
  @IsOptional() @IsString() altMobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() landmark?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsIn(CUSTOMER_SEGMENTS) segment?: CreateContactDtoShape['segment'];
  @IsOptional() @IsIn(CONTACT_SOURCES) source?: CreateContactDtoShape['source'];
  @IsOptional() @IsString() assignedTo?: string;
  @IsArray() @IsString({ each: true }) tags!: string[];
  @ValidateNested() @Type(() => ContactConsentInput) consent!: ContactConsentDto;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateContactOrderInput) orders!: CreateContactOrderDto[];
}
