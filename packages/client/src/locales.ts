import * as locales from '@james-pre/locales';
import en from '../locales/en.json' with { type: 'json' };

locales.extend('en', en);

export { conjoin, countryName, dateField, disjoin, escape, text, type ReplacementOptions } from '@james-pre/locales';
