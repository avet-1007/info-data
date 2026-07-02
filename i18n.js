/* ============================================================================
 * i18n.js — UI translations (English / Русский / Հայերեն).
 *
 *   t(key, vars?)   translated string for the current language
 *   setLang(code)   switch language + re-apply
 *   getLang()       current code
 *   applyI18n()     update [data-i18n], [data-i18n-title], [data-i18n-ph]
 *                   and call window.onI18nApply (for JS-rendered UI)
 * ==========================================================================*/

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'hy', label: 'Հայերեն' },
];

const STRINGS = {
  en: {
    'app.connect': 'Connect folder', 'app.reconnect': 'Open “{name}”',
    'app.project': 'Project', 'app.folder': 'Folder', 'app.document': 'Document',
    'app.console': 'Console', 'app.ai': 'AI', 'app.help': 'Supported formats', 'app.settings': 'Settings',
    'sidebar.files': 'Files', 'sidebar.empty': 'Empty — create a project',
    'sidebar.newProject': 'New project', 'sidebar.newFolder': 'New folder',
    'sidebar.newDocument': 'New document', 'tree.rename': 'Rename', 'tree.delete': 'Delete',
    'welcome.subtitle': 'Create a project or open a document',
    'welcome.formatsTitle': 'What info-data can do — supported formats:',
    'settings.title': 'Settings', 'settings.language': 'Language',
    'settings.fileIcons': 'File-tree icons', 'settings.iconsLogos': 'Real logos',
    'settings.iconsLucide': 'Original (Lucide)',
    'settings.iconsHint': 'Real logos load from the internet; the original set is built-in.',
    'settings.close': 'Close',
    'formats.title': 'Supported formats', 'formats.view': 'View', 'formats.edit': 'Editor',
    'formats.hintLabel': 'Supported formats',
    'fmt.code': 'Code', 'fmt.text': 'Text', 'fmt.images': 'Images', 'fmt.models': '3D models', 'fmt.diagrams': 'Diagrams',
    'mode.edit': 'Editor', 'mode.split': 'Split', 'mode.preview': 'Preview',
    'modal.create': 'Create', 'modal.cancel': 'Cancel', 'modal.ok': 'OK', 'modal.save': 'Save',
    'modal.delete': 'Delete', 'modal.rename': 'Save',
    'modal.newProject': 'New project', 'modal.newFolder': 'New folder', 'modal.newDocument': 'New document',
    'modal.namePh': 'Name…', 'modal.renameTitle': 'Rename', 'modal.renamePh': 'New name…',
    'modal.deleteFile': 'Delete “{name}”?', 'modal.deleteDir': 'Delete “{name}” and all its contents?',
    'modal.exists': 'An item with this name already exists', 'modal.noSlash': 'Name cannot contain “/”',
    'console.title': 'File-system console', 'console.hint': 'help — list of commands',
    'console.ph': 'type a command…  (Tab — complete)',
    'save.unsaved': 'Unsaved…', 'save.saved': 'Saved ✓',
    'badge.browser': 'Browser (IndexedDB)', 'badge.disk': 'Disk: {name}',
    'kind.image': 'Image', 'kind.video': 'Video', 'kind.audio': 'Audio', 'kind.archive': 'Archive',
    'kind.diagram': 'Diagram',
    'viewer.reset': 'Reset view', 'viewer.autorotate': 'Auto-rotate', 'viewer.wireframe': 'Wireframe',
    'viewer.edit': 'Edit', 'viewer.move': 'Move', 'viewer.rotate': 'Rotate', 'viewer.scale': 'Scale',
    'viewer.color': 'Selected part colour', 'viewer.selectHint': 'Click a part of the model to select',
    'media.rotL': 'Rotate left', 'media.rotR': 'Rotate right', 'media.flipH': 'Flip horizontally',
    'media.flipV': 'Flip vertically', 'media.brightness': 'Brightness', 'media.contrast': 'Contrast',
    'media.saturation': 'Saturation', 'media.hue': 'Hue', 'media.blur': 'Blur', 'media.reset': 'Reset',
    'media.save': 'Save', 'media.crop': 'Crop', 'media.applyCrop': 'Apply crop', 'media.brush': 'Brush',
    'media.text': 'Text', 'media.move': 'Move/zoom', 'media.undo': 'Undo', 'media.redo': 'Redo',
    'media.zoomIn': 'Zoom in', 'media.zoomOut': 'Zoom out', 'media.brushSize': 'Size',
    'media.frame': 'Frame → PNG', 'media.trim': 'Trim → webm', 'media.split': 'Split here',
    'media.start': 'Start', 'media.end': 'End', 'media.speed': 'Speed', 'media.recording': 'Recording…',
    'media.done': 'Done ✓', 'media.saving': 'Saving…', 'media.error': 'Error',
    'media.viewOnly': 'View only', 'media.eraser': 'Eraser', 'zip.files': '{n} files', 'zip.pick': 'Pick a file on the left',
    'zip.noPreview': 'preview unavailable',
    'kind.folder': 'folder', 'kind.file': 'file',
    'error.fileEmpty': 'file is empty', 'error.model3d': 'Could not open the 3D model.', 'error.needNet': 'Needs internet — Three.js loads from a CDN.', 'error.mediaOpen': 'Could not open the file.', 'error.folderConnect': 'Could not connect the folder: ',
    'cmd.help': 'list of commands', 'cmd.pwd': 'working directory', 'cmd.ls': 'list', 'cmd.cd': 'change directory', 'cmd.project': 'new project (root folder)', 'cmd.mkdir': 'make folder', 'cmd.touch': 'create file', 'cmd.write': 'write to file', 'cmd.cat': 'show file', 'cmd.open': 'open in editor', 'cmd.rm': 'remove', 'cmd.mv': 'move / rename', 'cmd.cp': 'copy', 'cmd.tree': 'tree', 'cmd.find': 'search by name', 'cmd.ai': 'ask AI assistant', 'cmd.echo': 'print text', 'cmd.clear': 'clear console',
    'ai.title': 'AI Assistant', 'ai.hint': 'Enter to send, Shift+Enter for new line', 'ai.system': 'System prompt:', 'ai.systemPh': 'You are a helpful assistant.', 'ai.ph': 'Ask AI anything…', 'ai.send': 'Send',
  },
  ru: {
    'app.connect': 'Подключить папку', 'app.reconnect': 'Открыть «{name}»',
    'app.project': 'Проект', 'app.folder': 'Папка', 'app.document': 'Документ',
    'app.console': 'Консоль', 'app.ai': 'AI', 'app.help': 'Поддерживаемые форматы', 'app.settings': 'Настройки',
    'sidebar.files': 'Файлы', 'sidebar.empty': 'Пусто — создайте проект',
    'sidebar.newProject': 'Новый проект', 'sidebar.newFolder': 'Новая папка',
    'sidebar.newDocument': 'Новый документ', 'tree.rename': 'Переименовать', 'tree.delete': 'Удалить',
    'welcome.subtitle': 'Создайте проект или откройте документ',
    'welcome.formatsTitle': 'Что умеет info-data — поддерживаемые форматы:',
    'settings.title': 'Настройки', 'settings.language': 'Язык',
    'settings.fileIcons': 'Иконки файлов', 'settings.iconsLogos': 'Настоящие логотипы',
    'settings.iconsLucide': 'Оригинальные (Lucide)',
    'settings.iconsHint': 'Настоящие логотипы грузятся из интернета; оригинальные встроены в приложение.',
    'settings.close': 'Закрыть',
    'formats.title': 'Поддерживаемые форматы', 'formats.view': 'Просмотр', 'formats.edit': 'Редактор',
    'formats.hintLabel': 'Поддерживаемые форматы',
    'fmt.code': 'Код', 'fmt.text': 'Текст', 'fmt.images': 'Изображения', 'fmt.models': '3D-модели', 'fmt.diagrams': 'Диаграммы',
    'mode.edit': 'Редактор', 'mode.split': 'Сплит', 'mode.preview': 'Просмотр',
    'modal.create': 'Создать', 'modal.cancel': 'Отмена', 'modal.ok': 'OK', 'modal.save': 'Сохранить',
    'modal.delete': 'Удалить', 'modal.rename': 'Сохранить',
    'modal.newProject': 'Новый проект', 'modal.newFolder': 'Новая папка', 'modal.newDocument': 'Новый документ',
    'modal.namePh': 'Название…', 'modal.renameTitle': 'Переименовать', 'modal.renamePh': 'Новое имя…',
    'modal.deleteFile': 'Удалить «{name}»?', 'modal.deleteDir': 'Удалить «{name}» и всё содержимое?',
    'modal.exists': 'Такой элемент уже существует', 'modal.noSlash': 'Имя не может содержать «/»',
    'console.title': 'Консоль файловой системы', 'console.hint': 'help — список команд',
    'console.ph': 'введите команду…  (Tab — дополнить)',
    'save.unsaved': 'Не сохранено…', 'save.saved': 'Сохранено ✓',
    'badge.browser': 'Браузер (IndexedDB)', 'badge.disk': 'Диск: {name}',
    'kind.image': 'Изображение', 'kind.video': 'Видео', 'kind.audio': 'Аудио', 'kind.archive': 'Архив',
    'kind.diagram': 'Диаграмма',
    'viewer.reset': 'Сбросить вид', 'viewer.autorotate': 'Автоповорот', 'viewer.wireframe': 'Каркас',
    'viewer.edit': 'Редактировать', 'viewer.move': 'Двигать', 'viewer.rotate': 'Вращать', 'viewer.scale': 'Масштаб',
    'viewer.color': 'Цвет выбранной части', 'viewer.selectHint': 'Клик по части модели — выбрать',
    'media.rotL': 'Повернуть влево', 'media.rotR': 'Повернуть вправо', 'media.flipH': 'Отразить ↔',
    'media.flipV': 'Отразить ↕', 'media.brightness': 'Яркость', 'media.contrast': 'Контраст',
    'media.saturation': 'Насыщенность', 'media.hue': 'Оттенок', 'media.blur': 'Размытие', 'media.reset': 'Сброс',
    'media.save': 'Сохранить', 'media.crop': 'Обрезка', 'media.applyCrop': 'Применить', 'media.brush': 'Кисть',
    'media.text': 'Текст', 'media.move': 'Перемещение', 'media.undo': 'Отменить', 'media.redo': 'Повторить',
    'media.zoomIn': 'Приблизить', 'media.zoomOut': 'Отдалить', 'media.brushSize': 'Размер',
    'media.frame': 'Кадр → PNG', 'media.trim': 'Обрезать → webm', 'media.split': 'Разрезать здесь',
    'media.start': 'Начало', 'media.end': 'Конец', 'media.speed': 'Скорость', 'media.recording': 'Запись…',
    'media.done': 'Готово ✓', 'media.saving': 'Сохранение…', 'media.error': 'Ошибка',
    'media.viewOnly': 'Только просмотр', 'media.eraser': 'Ластик', 'zip.files': '{n} файлов', 'zip.pick': 'Выберите файл слева',
    'zip.noPreview': 'предпросмотр недоступен',
    'kind.folder': 'папка', 'kind.file': 'файл',
    'error.fileEmpty': 'файл пуст', 'error.model3d': 'Не удалось открыть 3D-модель.', 'error.needNet': 'Для просмотра нужен интернет — Three.js загружается из CDN.', 'error.mediaOpen': 'Не удалось открыть файл.', 'error.folderConnect': 'Не удалось подключить папку: ',
    'cmd.help': 'список команд', 'cmd.pwd': 'текущая папка', 'cmd.ls': 'список', 'cmd.cd': 'перейти в папку', 'cmd.project': 'создать проект (папку в корне)', 'cmd.mkdir': 'создать папку', 'cmd.touch': 'создать файл', 'cmd.write': 'записать в файл', 'cmd.cat': 'показать файл', 'cmd.open': 'открыть в редакторе', 'cmd.rm': 'удалить', 'cmd.mv': 'переместить / переименовать', 'cmd.cp': 'копировать', 'cmd.tree': 'дерево', 'cmd.find': 'поиск по имени', 'cmd.ai': 'спросить AI ассистента', 'cmd.echo': 'вывести текст', 'cmd.clear': 'очистить консоль',
    'ai.title': 'AI ассистент', 'ai.hint': 'Enter — отправить, Shift+Enter — новая строка', 'ai.system': 'Системный промпт:', 'ai.systemPh': 'You are a helpful assistant.', 'ai.ph': 'Напишите запрос AI…', 'ai.send': 'Отправить',
  },
  hy: {
    'app.connect': 'Միացնել թղթապանակ', 'app.reconnect': 'Բացել «{name}»',
    'app.project': 'Նախագիծ', 'app.folder': 'Թղթապանակ', 'app.document': 'Փաստաթուղթ',
    'app.console': 'Կոնսոլ', 'app.ai': 'AI', 'app.help': 'Աջակցվող ձևաչափեր', 'app.settings': 'Կարգավորումներ',
    'sidebar.files': 'Ֆայլեր', 'sidebar.empty': 'Դատարկ է — ստեղծեք նախագիծ',
    'sidebar.newProject': 'Նոր նախագիծ', 'sidebar.newFolder': 'Նոր թղթապանակ',
    'sidebar.newDocument': 'Նոր փաստաթուղթ', 'tree.rename': 'Վերանվանել', 'tree.delete': 'Ջնջել',
    'welcome.subtitle': 'Ստեղծեք նախագիծ կամ բացեք փաստաթուղթ',
    'welcome.formatsTitle': 'Ինչ կարող է info-data-ն — աջակցվող ձևաչափերը.',
    'settings.title': 'Կարգավորումներ', 'settings.language': 'Լեզու',
    'settings.fileIcons': 'Ֆայլերի պատկերակներ', 'settings.iconsLogos': 'Իրական լոգոներ',
    'settings.iconsLucide': 'Բնօրինակ (Lucide)',
    'settings.iconsHint': 'Իրական լոգոները բեռնվում են ինտերնետից; բնօրինակները ներդրված են ծրագրում։',
    'settings.close': 'Փակել',
    'formats.title': 'Աջակցվող ձևաչափեր', 'formats.view': 'Դիտում', 'formats.edit': 'Խմբագիր',
    'formats.hintLabel': 'Աջակցվող ձևաչափեր',
    'fmt.code': 'Կոդ', 'fmt.text': 'Տեքստ', 'fmt.images': 'Նկարներ', 'fmt.models': '3D մոդելներ', 'fmt.diagrams': 'Դիագրամներ',
    'mode.edit': 'Խմբագիր', 'mode.split': 'Բաժանված', 'mode.preview': 'Նախադիտում',
    'modal.create': 'Ստեղծել', 'modal.cancel': 'Չեղարկել', 'modal.ok': 'Լավ', 'modal.save': 'Պահպանել',
    'modal.delete': 'Ջնջել', 'modal.rename': 'Պահպանել',
    'modal.newProject': 'Նոր նախագիծ', 'modal.newFolder': 'Նոր թղթապանակ', 'modal.newDocument': 'Նոր փաստաթուղթ',
    'modal.namePh': 'Անուն…', 'modal.renameTitle': 'Վերանվանել', 'modal.renamePh': 'Նոր անուն…',
    'modal.deleteFile': 'Ջնջե՞լ «{name}»-ը։', 'modal.deleteDir': 'Ջնջե՞լ «{name}»-ը և ամբողջ պարունակությունը։',
    'modal.exists': 'Այդ անունով տարր արդեն կա', 'modal.noSlash': 'Անունը չի կարող պարունակել «/»',
    'console.title': 'Ֆայլային համակարգի կոնսոլ', 'console.hint': 'help — հրամանների ցանկ',
    'console.ph': 'մուտքագրեք հրաման…  (Tab — լրացնել)',
    'save.unsaved': 'Չպահպանված…', 'save.saved': 'Պահպանված ✓',
    'badge.browser': 'Դիտարկիչ (IndexedDB)', 'badge.disk': 'Սկավառակ՝ {name}',
    'kind.image': 'Նկար', 'kind.video': 'Տեսանյութ', 'kind.audio': 'Աուդիո', 'kind.archive': 'Արխիվ',
    'kind.diagram': 'Դիագրամ',
    'viewer.reset': 'Վերակայել տեսքը', 'viewer.autorotate': 'Ինքնապտույտ', 'viewer.wireframe': 'Կմախք',
    'viewer.edit': 'Խմբագրել', 'viewer.move': 'Տեղափոխել', 'viewer.rotate': 'Պտտել', 'viewer.scale': 'Մասշտաբ',
    'viewer.color': 'Ընտրված մասի գույնը', 'viewer.selectHint': 'Սեղմեք մոդելի մասը՝ ընտրելու համար',
    'media.rotL': 'Պտտել ձախ', 'media.rotR': 'Պտտել աջ', 'media.flipH': 'Շրջել ↔',
    'media.flipV': 'Շրջել ↕', 'media.brightness': 'Պայծառություն', 'media.contrast': 'Կոնտրաստ',
    'media.saturation': 'Հագեցվածություն', 'media.hue': 'Երանգ', 'media.blur': 'Մշուշ', 'media.reset': 'Վերակայել',
    'media.save': 'Պահպանել', 'media.crop': 'Կտրել', 'media.applyCrop': 'Կիրառել', 'media.brush': 'Վրձին',
    'media.text': 'Տեքստ', 'media.move': 'Տեղափոխում', 'media.undo': 'Հետարկել', 'media.redo': 'Կրկնել',
    'media.zoomIn': 'Մեծացնել', 'media.zoomOut': 'Փոքրացնել', 'media.brushSize': 'Չափ',
    'media.frame': 'Կադր → PNG', 'media.trim': 'Կտրել → webm', 'media.split': 'Բաժանել այստեղ',
    'media.start': 'Սկիզբ', 'media.end': 'Վերջ', 'media.speed': 'Արագություն', 'media.recording': 'Ձայնագրում…',
    'media.done': 'Պատրաստ է ✓', 'media.saving': 'Պահպանում…', 'media.error': 'Սխալ',
    'media.viewOnly': 'Միայն դիտում', 'media.eraser': 'Ջնջիչ', 'zip.files': '{n} ֆայլ', 'zip.pick': 'Ընտրեք ֆայլ ձախ կողմում',
    'zip.noPreview': 'նախադիտումն անհասանելի է',
    'kind.folder': 'թղթապանակ', 'kind.file': 'ֆայլ',
    'error.fileEmpty': 'ֆայլը դատարկ է', 'error.model3d': 'Չհաջողվեց բացել 3D մոդելը։', 'error.needNet': 'Անհրաժեշտ է ինտերնետ — Three.js-ը բեռնվում է CDN-ից։', 'error.mediaOpen': 'Չհաջողվեց բացել ֆայլը։', 'error.folderConnect': 'Չհաջողվեց միացնել թղթապանակը՝ ',
    'cmd.help': 'հրամանների ցանկ', 'cmd.pwd': 'ընթացիկ թղթապանակ', 'cmd.ls': 'ցանկ', 'cmd.cd': 'անցնել թղթապանակ', 'cmd.project': 'նոր նախագիծ (արմատային թղթապանակ)', 'cmd.mkdir': 'ստեղծել թղթապանակ', 'cmd.touch': 'ստեղծել ֆայլ', 'cmd.write': 'գրել ֆայլում', 'cmd.cat': 'ցույց տալ ֆայլը', 'cmd.open': 'բացել խմբագրում', 'cmd.rm': 'ջնջել', 'cmd.mv': 'տեղափոխել / վերանվանել', 'cmd.cp': 'պատճենել', 'cmd.tree': 'ծառ', 'cmd.find': 'որոնում ըստ անվան', 'cmd.ai': 'հարցնել AI օգնականին', 'cmd.echo': 'տպել տեքստ', 'cmd.clear': 'մաքրել կոնսոլը',
    'ai.title': 'AI օգնական', 'ai.hint': 'Enter — ուղարկել, Shift+Enter — նոր տող', 'ai.system': 'Համակարգային հուշում.', 'ai.systemPh': 'You are a helpful assistant.', 'ai.ph': 'Հարցրեք AI-ին…', 'ai.send': 'Ուղարկել',
  },
};

let curLang = localStorage.getItem('info-data-lang') || 'ru';

function t(key, vars) {
  let s = (STRINGS[curLang] && STRINGS[curLang][key]) || STRINGS.en[key] || key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}
function getLang() { return curLang; }
function setLang(code) {
  if (!STRINGS[code]) return;
  curLang = code;
  localStorage.setItem('info-data-lang', code);
  document.documentElement.lang = code;
  applyI18n();
}
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  if (typeof window.onI18nApply === 'function') window.onI18nApply();
}

window.t = t;
window.getLang = getLang;
window.setLang = setLang;
window.applyI18n = applyI18n;
window.I18N_LANGS = LANGS;
