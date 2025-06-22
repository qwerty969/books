const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const isVercel = process.env.VERCEL === '1';

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация базы данных (только для локальной разработки)
let db;
if (!isVercel) {
  const sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database('./books.db');
  // Создание таблицы для кэширования
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS books_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT,
      results TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
}

// Функция для поиска книг
async function searchBooks(query) {
  try {
    // Проверяем кэш (только для локальной разработки)
    if (!isVercel) {
      const cached = await new Promise((resolve, reject) => {
        db.get("SELECT results FROM books_cache WHERE query = ? AND created_at > datetime('now', '-1 hour')",
          [query], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
      });

      if (cached) {
        return JSON.parse(cached.results);
      }
    }

    // --- Параллельный поиск на сайтах ---
    const sources = [
      searchFlibusta,
      searchLitnet,
      searchKnigopoisk,
      searchRoyalLib,
      searchEReading,
      searchLibRu
    ];

    const promises = sources.map(source => source(query));
    const results = await Promise.allSettled(promises);

    const flatBooks = results
      .filter(result => result.status === 'fulfilled' && Array.isArray(result.value))
      .flatMap(result => result.value);

    // Если после всех поисков ничего не найдено, возвращаем демо-данные
    if (flatBooks.length === 0) {
      console.log('No books found from any source, returning demo data.');
      return getDemoBooks();
    }
    
    const groupedBooks = groupBooks(flatBooks);

    // Сохраняем в кэш (только для локальной разработки)
    if (!isVercel) {
      db.run("INSERT INTO books_cache (query, results) VALUES (?, ?)",
        [query, JSON.stringify(groupedBooks)]);
    }

    return groupedBooks;
  } catch (error) {
    console.error('General error in searchBooks:', error);
    return [];
  }
}

function groupBooks(books) {
    const grouped = new Map();

    books.forEach(book => {
        // Ключ для группировки: "автор|название" в нижнем регистре
        const key = `${book.author.toLowerCase().trim()}|${book.title.toLowerCase().trim()}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                title: book.title,
                author: book.author,
                // По умолчанию берем первое описание
                description: book.description,
                sources: []
            });
        }

        const entry = grouped.get(key);
        entry.sources.push({
            name: book.source,
            link: book.downloadLink
        });

        // Выбираем самое длинное и информативное описание для группы
        if (book.description && book.description.length > entry.description.length && !entry.description.startsWith('Жанр:')) {
            entry.description = book.description;
        }
    });

    return Array.from(grouped.values());
}

// --- Функции для парсинга каждого сайта ---

async function searchFlibusta(query) {
  try {
    const response = await axios.get(`http://flibusta.is/booksearch?ask=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' },
      timeout: 8000
    });
    const $ = cheerio.load(response.data);
    const books = [];
    $('#main a').each((i, element) => {
      const link = $(element);
      const href = link.attr('href');
      if (href && href.startsWith('/b/')) {
        const title = link.text().trim();
        let author = 'Неизвестен';
        const authorNode = link.parent().nextAll('a[href^="/a/"]').first();
        if (authorNode.length) {
          author = authorNode.text().trim();
        }
        if (title && title !== 'читать' && title !== 'скачать') {
          books.push({ title, author, description: 'Описание будет добавлено позже.', downloadLink: `http://flibusta.is${href}`, source: 'flibusta.is' });
        }
      }
    });
    console.log(`Flibusta found ${books.length} books.`);
    return books;
  } catch (error) {
    console.log('Ошибка при поиске на flibusta:', error.message);
    return [];
  }
}

async function searchLitnet(query) {
    try {
        const response = await axios.get(`https://litnet.com/ru/search?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' },
            timeout: 8000
        });
        const $ = cheerio.load(response.data);
        const books = [];
        $('.book-item').each((i, element) => {
            const title = $(element).find('h4.book-title a').text().trim();
            const author = $(element).find('.author-name').text().trim();
            const description = $(element).find('.annotation-text').text().trim();
            const downloadLink = $(element).find('a.cover').attr('href');
            if (title && author) {
                books.push({ title, author, description, downloadLink: `https://litnet.com${downloadLink}`, source: 'litnet.com' });
            }
        });
        console.log(`Litnet found ${books.length} books.`);
        return books;
    } catch (error) {
        console.log('Ошибка при поиске на litnet:', error.message);
        return [];
    }
}

async function searchKnigopoisk(query) {
    try {
        const response = await axios.get(`https://knigopoisk.org/search/books?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' },
            timeout: 8000
        });
        const $ = cheerio.load(response.data);
        const books = [];
        $('.book-item').each((i, element) => {
            const title = $(element).find('.book-title a').text().trim();
            const author = $(element).find('.book-author a').text().trim();
            const description = $(element).find('.book-description').text().trim();
            const bookLink = $(element).find('.book-title a').attr('href');
            if (title && author) {
                books.push({ title, author, description, downloadLink: `https://knigopoisk.org${bookLink}`, source: 'knigopoisk.org' });
            }
        });
        console.log(`Knigopoisk found ${books.length} books.`);
        return books;
    } catch (error) {
        console.log('Ошибка при поиске на knigopoisk.org:', error.message);
        return [];
    }
}

async function searchRoyalLib(query) {
    try {
        const response = await axios.get(`https://royallib.com/search?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' },
            timeout: 8000
        });
        const $ = cheerio.load(response.data);
        const books = [];
        $('table.stripy tr').each((i, element) => {
            const authorNode = $(element).find('a[href*="/author/"]');
            const bookNode = $(element).find('a[href*="/book/"]');
            
            if (authorNode.length && bookNode.length) {
                const author = authorNode.text().trim();
                const title = bookNode.text().trim();
                const downloadLink = 'https://royallib.com' + bookNode.attr('href');
                
                books.push({
                    title,
                    author,
                    description: 'Жанр: ' + $(element).find('td').eq(2).text().trim(),
                    downloadLink,
                    source: 'royallib.com'
                });
            }
        });
        console.log(`RoyalLib found ${books.length} books.`);
        return books;
    } catch (error) {
        console.log('Ошибка при поиске на royallib.com:', error.message);
        return [];
    }
}

async function searchEReading(query) {
    try {
        const response = await axios.get(`https://www.e-reading.club/search.php?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' },
            timeout: 8000
        });
        const $ = cheerio.load(response.data);
        const books = [];
        $('td > table.book').each((i, element) => {
            const titleNode = $(element).find('a[href^="book.php?book="]');
            const authorNode = $(element).find('a[href^="bookbyauthor.php?author="]');

            if (titleNode.length && authorNode.length) {
                const title = titleNode.text().trim();
                const author = authorNode.text().trim();
                const downloadLink = 'https://www.e-reading.club/' + titleNode.attr('href');
                const description = $(element).find('td[valign="top"]').eq(1).text().trim().split('\n')[0];

                books.push({
                    title,
                    author,
                    description,
                    downloadLink,
                    source: 'e-reading.club'
                });
            }
        });
        console.log(`E-reading.club found ${books.length} books.`);
        return books;
    } catch (error) {
        console.log('Ошибка при поиске на e-reading.club:', error.message);
        return [];
    }
}

async function searchLibRu(query) {
    try {
        // lib.ru использует кодировку KOI8-R, поэтому нам нужен специальный подход.
        const response = await axios.get(`http://lib.ru/cgi-bin/search?q=${encodeURIComponent(query)}`, {
            responseType: 'arraybuffer', // Получаем как бинарные данные
            timeout: 10000
        });

        // Декодируем из KOI8-R в UTF-8
        const Iconv = require('iconv').Iconv;
        const converter = new Iconv('KOI8-R', 'UTF-8');
        const body = converter.convert(response.data).toString();
        
        const $ = cheerio.load(body);
        const books = [];

        $('li').each((i, element) => {
            const linkNode = $(element).find('a');
            const authorNode = $(element).find('b');

            if (linkNode.length && authorNode.length) {
                const author = authorNode.text().trim().replace(':', '');
                const title = linkNode.text().trim();
                const downloadLink = 'http://lib.ru' + linkNode.attr('href');
                
                // Пропускаем ссылки на сам поисковик
                if (!downloadLink.includes('cgi-bin/search')) {
                     books.push({
                        title,
                        author,
                        description: `Найдено в библиотеке Мошкова (lib.ru)`,
                        downloadLink,
                        source: 'lib.ru'
                    });
                }
            }
        });
        console.log(`Lib.ru found ${books.length} books.`);
        return books;
    } catch (error) {
        console.log('Ошибка при поиске на lib.ru:', error.message);
        return [];
    }
}

function getDemoBooks() {
  return [
    {
      title: "Война и мир",
      author: "Лев Толстой",
      description: "Роман-эпопея, описывающий русское общество в эпоху наполеоновских войн.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Преступление и наказание",
      author: "Фёдор Достоевский",
      description: "Психологический роман о преступлении и его последствиях.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Мастер и Маргарита",
      author: "Михаил Булгаков",
      description: "Философский роман о добре и зле, любви и предательстве.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Отцы и дети",
      author: "Иван Тургенев",
      description: "Роман о конфликте поколений и идейных разногласиях в русском обществе XIX века.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Мёртвые души",
      author: "Николай Гоголь",
      description: "Поэма в прозе, сатирически изображающая помещичью Россию.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Герой нашего времени",
      author: "Михаил Лермонтов",
      description: "Первый психологический роман в русской литературе.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Анна Каренина",
      author: "Лев Толстой",
      description: "Трагическая история любви замужней женщины.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Евгений Онегин",
      author: "Александр Пушкин",
      description: "Роман в стихах, энциклопедия русской жизни.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Тихий Дон",
      author: "Михаил Шолохов",
      description: "Роман-эпопея о донском казачестве во время Первой мировой и Гражданской войн.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Собачье сердце",
      author: "Михаил Булгаков",
      description: "Сатирическая повесть об опасных социальных экспериментах.",
      downloadLink: "#",
      source: "demo"
    },
    {
      title: "Горе от ума",
      author: "Александр Грибоедов",
      description: "Классическая комедия в стихах, высмеивающая нравы московского дворянства.",
      downloadLink: "#",
      source: "demo"
    },
    {
        title: "Доктор Живаго",
        author: "Борис Пастернак",
        description: "Роман о жизни русской интеллигенции на фоне драматических событий начала XX века.",
        downloadLink: "#",
        source: "demo"
    }
  ];
}

// API маршруты
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Параметр поиска обязателен' });
    }

    const results = await searchBooks(q);
    res.json({ results });
  } catch (error) {
    console.error('Ошибка API:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.get('/api/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Здесь будет логика скачивания
    res.json({ message: 'Функция скачивания в разработке', id });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при скачивании' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`API доступен по адресу: http://localhost:${PORT}/api`);
}); 