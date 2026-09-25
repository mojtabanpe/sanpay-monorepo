import { TourismWallet } from './tourism.model';

export interface FlightSearchInput {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  infants: number;
}
export interface FlightAirport {
  iata: string;
  name: string;
}
export interface FlightLeg {
  key: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  airline: string;
  flightNumber: string;
  flightClass: string;
  flightType: string;
  baggage: number;
  stops: number;
  capacity: number;
  foreign: boolean;
  cancellationRules: string[];
}
export interface FlightOffer {
  id: string;
  departure: FlightLeg;
  returning: FlightLeg | null;
  /** Total for all passengers, in toman. */
  amount: number;
}
export interface FlightPassenger {
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  type: 'adult' | 'child' | 'infant';
  birthdate: string;
  /** ISO alpha-2, as required by the flight supplier. */
  nationality: string;
  nationalCode?: string;
  passportNumber?: string;
  passportExpirationDate?: string;
  /** ISO alpha-2 */
  passportIssueCountry?: string;
}
export interface FlightQuote {
  id: string;
  offer: FlightOffer;
  search: FlightSearchInput;
  expiresAt: string;
  wallets: TourismWallet[];
}
export interface FlightBookingInput {
  quoteId: string;
  allocationId: string;
  bookerFirstName: string;
  bookerLastName: string;
  mobile: string;
  passengers: FlightPassenger[];
}
export type FlightBookingStatus =
  'PROCESSING' | 'CONFIRMED' | 'REJECTED' | 'REVIEW';
export interface FlightTicket {
  id: number;
  number: string;
  pnr: string;
  passengerName: string;
  direction: string;
}
export interface FlightBookingReceipt {
  tickets: FlightTicket[];
  id: string;
  confirmationCode: string | null;
  status: FlightBookingStatus;
  offer: FlightOffer;
  amount: number;
  refunded: boolean;
  walletName: string;
  createdAt: string;
}
