import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  FlightBookingInput,
  FlightPassenger,
  FlightSearchInput,
} from '@sanpay/models';

export class SearchFlightsDto implements FlightSearchInput {
  @Matches(/^[A-Z]{3}$/) origin!: string;
  @Matches(/^[A-Z]{3}$/) destination!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  departureDate!: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  returnDate?: string;
  @IsInt() @Min(1) @Max(9) adults!: number;
  @IsInt() @Min(0) @Max(8) children!: number;
  @IsInt() @Min(0) @Max(9) infants!: number;
}
export class QuoteFlightDto extends SearchFlightsDto {
  @IsString() @MinLength(1) @MaxLength(500) offerId!: string;
}
export class FlightPassengerDto implements FlightPassenger {
  @Matches(/^[A-Za-z][A-Za-z '-]{0,69}$/) firstName!: string;
  @Matches(/^[A-Za-z][A-Za-z '-]{0,69}$/) lastName!: string;
  @IsIn(['male', 'female']) gender!: 'male' | 'female';
  @IsIn(['adult', 'child', 'infant']) type!: 'adult' | 'child' | 'infant';
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  birthdate!: string;
  @Matches(/^[A-Z]{2}$/) nationality!: string;
  @IsOptional() @Matches(/^\d{10}$/) nationalCode?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9]{3,20}$/) passportNumber?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  passportExpirationDate?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) passportIssueCountry?: string;
}
export class BookFlightDto implements FlightBookingInput {
  @IsUUID() quoteId!: string;
  @IsUUID() allocationId!: string;
  @IsString() @MinLength(1) @MaxLength(70) bookerFirstName!: string;
  @IsString() @MinLength(1) @MaxLength(70) bookerLastName!: string;
  @Matches(/^09\d{9}$/) mobile!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(18)
  @ValidateNested({ each: true })
  @Type(() => FlightPassengerDto)
  passengers!: FlightPassengerDto[];
}
