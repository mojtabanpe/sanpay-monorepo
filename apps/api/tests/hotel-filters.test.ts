import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  HotelCard,
  NO_HOTEL_FILTERS,
  applyHotelFilters,
  hotelQueryWords,
} from '@sanpay/models';
import { HotelPageDto } from '../src/app/tourism/dto/tourism.dto';

const hotel = (id: string, name: string, cityName: string): HotelCard => ({
  id,
  name,
  rate: 4,
  type: 'هتل',
  cityId: cityName,
  cityName,
  address: '',
  photo: null,
});

const catalog = [
  hotel('1', 'اسپیناس پالاس', 'تهران'),
  hotel('2', 'هتل پارس‌کریم‌خان', 'شیراز'),
  hotel('3', 'Espinas Persian Gulf', 'تهران'),
  hotel('4', 'چمران', 'شیراز'),
];

const search = (query: string) =>
  applyHotelFilters([...catalog], { ...NO_HOTEL_FILTERS, query }).map(
    (card) => card.id,
  );

test('an empty search keeps every hotel', () => {
  assert.deepEqual(search(''), ['1', '2', '3', '4']);
  assert.deepEqual(search('   '), ['1', '2', '3', '4']);
});

test('matches part of the hotel name, ignoring the word «هتل»', () => {
  assert.deepEqual(search('اسپین'), ['1']);
  assert.deepEqual(search('هتل اسپیناس'), ['1']);
  assert.deepEqual(search('espinas'), ['3']);
});

test('tolerates Arabic letters, spacing and half-spaces', () => {
  assert.deepEqual(search('كريم خان'), ['2'], 'Arabic ك/ي and a space');
  assert.deepEqual(search('پارسکریمخان'), ['2'], 'no half-space');
});

test('also matches the city name, every word must match', () => {
  assert.deepEqual(search('شیراز'), ['2', '4']);
  assert.deepEqual(search('چمران شیراز'), ['4']);
  assert.deepEqual(search('چمران تهران'), []);
});

test('normalised query words drop «هتل» and blanks', () => {
  assert.deepEqual(hotelQueryWords(' هتل  آزادی '), ['ازادی']);
});

test('the page request accepts a query and stays valid without one', () => {
  const base = {
    checkin: '2030-01-01',
    nights: 1,
    capacity: 2,
    page: 1,
    pageSize: 20,
  };
  const withQuery = plainToInstance(HotelPageDto, {
    ...base,
    filters: { ...NO_HOTEL_FILTERS, query: 'اسپیناس' },
  });
  assert.deepEqual(validateSync(withQuery), []);
  assert.equal(withQuery.filters.query, 'اسپیناس');

  // an app version from before the search field sends no `query`
  const { query: _query, ...legacy } = NO_HOTEL_FILTERS;
  const old = plainToInstance(HotelPageDto, { ...base, filters: legacy });
  assert.deepEqual(validateSync(old), []);
  assert.equal(old.filters.query, '');

  const tooLong = plainToInstance(HotelPageDto, {
    ...base,
    filters: { ...NO_HOTEL_FILTERS, query: 'x'.repeat(101) },
  });
  assert.notDeepEqual(validateSync(tooLong), []);
});
