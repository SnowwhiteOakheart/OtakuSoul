import { useAppStore } from '../store/useAppStore';

export type SupportedLanguage = 'de' | 'en' | 'ru';

export interface Translations {
  [key: string]: {
    de: string;
    en: string;
    ru: string;
  };
}

export const DICTIONARY: Translations = {
  // Navigation Tabs
  'nav.chat': {
    de: 'Chat',
    en: 'Chat',
    ru: 'Чат',
  },
  'nav.characters': {
    de: 'Charaktere',
    en: 'Characters',
    ru: 'Персонажи',
  },
  'nav.hub': {
    de: 'Soul Hub',
    en: 'Soul Hub',
    ru: 'Soul Hub',
  },
  'nav.lorebooks': {
    de: 'Lorebooks',
    en: 'Lorebooks',
    ru: 'Лорбуки',
  },
  'nav.stage': {
    de: 'Soul Stage',
    en: 'Soul Stage',
    ru: 'Soul Stage',
  },
  'nav.companion': {
    de: 'Companion',
    en: 'Companion',
    ru: 'Компаньон',
  },
  'nav.integrations': {
    de: 'Integrationen',
    en: 'Integrations',
    ru: 'Интеграции',
  },
  'nav.settings': {
    de: 'Einstellungen',
    en: 'Settings',
    ru: 'Настройки',
  },

  // Header & Brand
  'header.version': {
    de: 'v0.1.0',
    en: 'v0.1.0',
    ru: 'v0.1.0',
  },
  'header.logs': {
    de: 'System-Logs',
    en: 'System Logs',
    ru: 'Системные логи',
  },
  'header.update': {
    de: 'Updates prüfen',
    en: 'Check Updates',
    ru: 'Проверить обновления',
  },
  'header.about': {
    de: 'Über OtakuSoul',
    en: 'About OtakuSoul',
    ru: 'О программе OtakuSoul',
  },
  'header.serverRunning': {
    de: 'Server läuft',
    en: 'Server running',
    ru: 'Сервер работает',
  },
  'header.serverStopped': {
    de: 'Server gestoppt',
    en: 'Server stopped',
    ru: 'Сервер остановлен',
  },

  // Common UI Buttons & Terms
  'common.save': {
    de: 'Speichern',
    en: 'Save',
    ru: 'Сохранить',
  },
  'common.saved': {
    de: 'Gespeichert!',
    en: 'Saved!',
    ru: 'Сохранено!',
  },
  'common.cancel': {
    de: 'Abbrechen',
    en: 'Cancel',
    ru: 'Отмена',
  },
  'common.close': {
    de: 'Schließen',
    en: 'Close',
    ru: 'Закрыть',
  },
  'common.delete': {
    de: 'Löschen',
    en: 'Delete',
    ru: 'Удалить',
  },
  'common.edit': {
    de: 'Bearbeiten',
    en: 'Edit',
    ru: 'Редактировать',
  },
  'common.import': {
    de: 'Importieren',
    en: 'Import',
    ru: 'Импорт',
  },
  'common.export': {
    de: 'Exportieren',
    en: 'Export',
    ru: 'Экспорт',
  },
  'common.start': {
    de: 'Starten',
    en: 'Start',
    ru: 'Запустить',
  },
  'common.stop': {
    de: 'Stoppen',
    en: 'Stop',
    ru: 'Остановить',
  },
  'common.refresh': {
    de: 'Aktualisieren',
    en: 'Refresh',
    ru: 'Обновить',
  },
  'common.copy': {
    de: 'Kopieren',
    en: 'Copy',
    ru: 'Копировать',
  },
  'common.copied': {
    de: 'Kopiert!',
    en: 'Copied!',
    ru: 'Скопировано!',
  },
  'common.search': {
    de: 'Suchen...',
    en: 'Search...',
    ru: 'Поиск...',
  },
  'common.loading': {
    de: 'Wird geladen...',
    en: 'Loading...',
    ru: 'Загрузка...',
  },
  'common.error': {
    de: 'Fehler',
    en: 'Error',
    ru: 'Ошибка',
  },
  'common.success': {
    de: 'Erfolgreich',
    en: 'Success',
    ru: 'Успешно',
  },
  'common.back': {
    de: 'Zurück',
    en: 'Back',
    ru: 'Назад',
  },
  'common.next': {
    de: 'Weiter',
    en: 'Next',
    ru: 'Далее',
  },

  // Settings View
  'settings.title': {
    de: 'Anwendungs-Einstellungen',
    en: 'Application Settings',
    ru: 'Настройки приложения',
  },
  'settings.subtitle': {
    de: 'Optik, Sprache, Inferenz-Provider und Hardware-Konfiguration',
    en: 'Appearance, language, inference providers, and hardware setup',
    ru: 'Внешний вид, язык, провайдеры инференса и настройка оборудования',
  },
  'settings.appearance': {
    de: 'Erscheinungsbild & Theme',
    en: 'Appearance & Theme',
    ru: 'Внешний вид и тема',
  },
  'settings.theme': {
    de: 'Farb-Theme',
    en: 'Color Theme',
    ru: 'Цветовая тема',
  },
  'settings.language': {
    de: 'Sprache der Benutzeroberfläche',
    en: 'UI Language',
    ru: 'Язык интерфейса',
  },
  'settings.backend': {
    de: 'Inferenz-Engine',
    en: 'Inference Engine',
    ru: 'Движок инференса',
  },
  'settings.localServer': {
    de: 'Lokaler llama-server (GGUF)',
    en: 'Local llama-server (GGUF)',
    ru: 'Локальный llama-server (GGUF)',
  },
  'settings.cloudProvider': {
    de: 'Cloud-Anbieter (OpenRouter, Anthropic, etc.)',
    en: 'Cloud Provider (OpenRouter, Anthropic, etc.)',
    ru: 'Облачный провайдер (OpenRouter, Anthropic и др.)',
  },
  'settings.modelPath': {
    de: 'Modellpfad (GGUF)',
    en: 'Model Path (GGUF)',
    ru: 'Путь к модели (GGUF)',
  },
  'settings.sampling': {
    de: 'Sampling-Parameter',
    en: 'Sampling Parameters',
    ru: 'Параметры сэмплинга',
  },
  'settings.temperature': {
    de: 'Temperatur',
    en: 'Temperature',
    ru: 'Температура',
  },
  'settings.maxTokens': {
    de: 'Max. Antwortlänge (Tokens)',
    en: 'Max Tokens',
    ru: 'Макс. длина ответа (токенов)',
  },
  'settings.hardwareTitle': {
    de: 'Erkannte Hardware & VRAM',
    en: 'Detected Hardware & VRAM',
    ru: 'Обнаруженное оборудование и VRAM',
  },

  // Themes
  'theme.obsidian': {
    de: 'Obsidian Violett (Standard)',
    en: 'Obsidian Violet (Default)',
    ru: 'Обсидиановый фиолетовый (По умолчанию)',
  },
  'theme.cyberpunk': {
    de: 'Cyberpunk Neon',
    en: 'Cyberpunk Neon',
    ru: 'Киберпанк неон',
  },
  'theme.sakura': {
    de: 'Sakura Kirschblüte',
    en: 'Sakura Blossom',
    ru: 'Сакура',
  },
  'theme.midnight': {
    de: 'Midnight OLED',
    en: 'Midnight OLED',
    ru: 'Полночный OLED',
  },
  'theme.emerald': {
    de: 'Matrix Smaragd',
    en: 'Matrix Emerald',
    ru: 'Матричный изумруд',
  },

  // Chat View
  'chat.placeholder': {
    de: 'Schreibe eine Nachricht an {{char}}...',
    en: 'Write a message to {{char}}...',
    ru: 'Напишите сообщение для {{char}}...',
  },
  'chat.voiceRecording': {
    de: 'Aufnahme läuft...',
    en: 'Recording...',
    ru: 'Запись...',
  },
  'chat.takePhoto': {
    de: 'Foto aufnehmen',
    en: 'Take Photo',
    ru: 'Сделать фото',
  },
  'chat.soulMemory': {
    de: 'Seelenspeicher',
    en: 'Soul Memory',
    ru: 'Память души',
  },
  'chat.reasoningMode': {
    de: 'Reasoning-Modus',
    en: 'Reasoning Mode',
    ru: 'Режим рассуждения',
  },

  // Integrations View
  'integrations.title': {
    de: 'Ökosystem & Integrationen',
    en: 'Ecosystem & Integrations',
    ru: 'Экосистема и интеграции',
  },
  'integrations.web': {
    de: 'Mobiler Web-Client',
    en: 'Mobile Web Client',
    ru: 'Мобильный веб-клиент',
  },
  'integrations.discord': {
    de: 'Discord',
    en: 'Discord',
    ru: 'Discord',
  },
  'integrations.image': {
    de: 'Bildgenerierung',
    en: 'Image Generation',
    ru: 'Генерация изображений',
  },
  'integrations.backup': {
    de: 'Profil-Backup',
    en: 'Profile Backup',
    ru: 'Резервные копии',
  },

  // Updater Modal
  'updater.title': {
    de: 'OtakuSoul Aktualisierungen',
    en: 'OtakuSoul Updates',
    ru: 'Обновления OtakuSoul',
  },
  'updater.checking': {
    de: 'Prüfe auf neue Versionen...',
    en: 'Checking for updates...',
    ru: 'Проверка обновлений...',
  },
  'updater.upToDate': {
    de: 'OtakuSoul ist auf dem neuesten Stand!',
    en: 'OtakuSoul is up to date!',
    ru: 'У вас установлена последняя версия OtakuSoul!',
  },
  'updater.updateAvailable': {
    de: 'Neue Version verfügbar!',
    en: 'New version available!',
    ru: 'Доступна новая версия!',
  },
  'updater.current': {
    de: 'Aktuelle Version',
    en: 'Current Version',
    ru: 'Текущая версия',
  },
  'updater.latest': {
    de: 'Neueste Version',
    en: 'Latest Version',
    ru: 'Последняя версия',
  },
  'updater.releaseNotes': {
    de: 'Änderungsprotokoll / Release Notes',
    en: 'Release Notes',
    ru: 'Список изменений / Release Notes',
  },
  'updater.openDownload': {
    de: 'Auf GitHub ansehen & herunterladen',
    en: 'View on GitHub & Download',
    ru: 'Открыть на GitHub и скачать',
  },

  // Logger Modal
  'logger.title': {
    de: 'System- & Fehlerprotokoll',
    en: 'System & Error Logs',
    ru: 'Системный журнал и ошибки',
  },
  'logger.subtitle': {
    de: 'Live-Aufzeichnung des Backends, der Inferenz und der Netzwerk-Dienste',
    en: 'Live trace of backend runtime, inference, and network services',
    ru: 'Журнал работы бэкенда, инференса и сетевых служб',
  },
  'logger.clear': {
    de: 'Protokoll leeren',
    en: 'Clear Logs',
    ru: 'Очистить журнал',
  },
  'logger.export': {
    de: 'Exportieren (.txt)',
    en: 'Export (.txt)',
    ru: 'Экспорт (.txt)',
  },
  'logger.noLogs': {
    de: 'Keine Log-Einträge vorhanden.',
    en: 'No log entries available.',
    ru: 'Журнал пуст.',
  },
  'logger.searchPlaceholder': {
    de: 'Filter nach Meldung, Modul oder Zeit...',
    en: 'Filter by message, module, or timestamp...',
    ru: 'Фильтр по сообщению, модулю или времени...',
  },
};

/**
 * Returns translated string for a given key and language.
 */
export function t(key: string, lang: SupportedLanguage = 'de'): string {
  const entry = DICTIONARY[key];
  if (!entry) {
    return key;
  }
  return entry[lang] || entry.de || key;
}

/**
 * React hook to access current translations re-rendering on language switch.
 */
export function useTranslation() {
  const appLanguage = useAppStore((s) => s.appLanguage) || 'de';

  const translate = (key: string, replacements?: Record<string, string>): string => {
    let text = t(key, appLanguage);
    if (replacements) {
      for (const [placeholder, val] of Object.entries(replacements)) {
        text = text.replace(new RegExp(`{{${placeholder}}}`, 'g'), val);
      }
    }
    return text;
  };

  return {
    t: translate,
    currentLanguage: appLanguage,
  };
}
