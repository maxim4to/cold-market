export const company = {
  name: 'ХолодМаркет',
  legalName: 'ООО «ХолодМаркет»',
  tagline: 'Холодильное и торговое оборудование в Твери',
  since: 'более 20 лет на рынке',
  address: {
    postal: '170021',
    city: 'Тверь',
    street: 'ул. Плеханова, д. 53',
    region: 'Тверская область',
    full: '170021, г. Тверь, ул. Плеханова, д. 53',
  },
  geo: { lat: 56.893914, lon: 35.892817 },
  phones: [
    { label: '8 (920) 691-04-35', href: 'tel:+79206910435', main: true },
    { label: '8 (4822) 71-04-35', href: 'tel:+74822710435' },
    { label: '8 (4822) 71-04-36', href: 'tel:+74822710436' },
  ],
  whatsapp: { label: '8 (920) 694-44-51', href: 'https://wa.me/79206944451' },
  telegram: { label: '@oborudovanie69', href: 'https://t.me/oborudovanie69' },
  email: 'coldmarket@bk.ru',
  hours: [
    { days: 'Пн–Чт', time: '9:00–17:00' },
    { days: 'Пт', time: '9:00–16:30' },
    { days: 'Сб–Вс', time: 'выходной' },
  ],
  priceNote:
    'Цены на сайте носят ознакомительный характер и не являются публичной офертой. Окончательная цена может отличаться от указанной как в меньшую, так и в большую сторону. Просим уточнять цены и наличие оборудования у наших менеджеров.',
};

export const env = {
  noindex: import.meta.env.PUBLIC_NOINDEX === 'true',
  metrikaId: import.meta.env.PUBLIC_METRIKA_ID || '',
  jivoId: import.meta.env.PUBLIC_JIVO_ID || '',
};

export const nav = [
  { href: '/', label: 'Каталог' },
  { href: '/services.html', label: 'Услуги' },
  { href: '/about.html', label: 'О компании' },
  { href: '/kontakty.html', label: 'Контакты' },
];

export const services = [
  {
    href: '/services/project.html',
    title: 'Проектирование',
    short: 'Планировка торгового зала и подбор оборудования под ваш формат.',
    image: '/images/Drawing1.png',
  },
  {
    href: '/services/montaz.html',
    title: 'Монтаж',
    short: 'Доставка, установка и пусконаладка с обучением персонала.',
    image: '/images/18082009060.jpg',
  },
  {
    href: '/services/to.html',
    title: 'Техническое обслуживание',
    short: 'Регулярное ТО холодильного и технологического оборудования.',
    image: '/images/Celseon.jpg',
  },
  {
    href: '/services/ro.html',
    title: 'Ремонт оборудования',
    short: 'Ремонт холодильного и технологического оборудования с выездом.',
    image: '/images/item_19.png',
  },
];
