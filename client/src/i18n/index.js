
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { uz } from './uz.js';
import { ru } from './ru.js';
import { en } from './en.js';


const saved = localStorage.getItem('xolt_lang');
const initial = ['uz', 'ru', 'en'].includes(saved) ? saved : 'uz';

i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'uz',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const setLang = (lang) => {
  i18n.changeLanguage(lang);
  localStorage.setItem('xolt_lang', lang);
};

export const getLang = () => i18n.language;

export default i18n;
