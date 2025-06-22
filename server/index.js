const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация базы данных
const db = new sqlite3.Database('./books.db');

// Создание таблицы для кэширования
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS books_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT,
    results TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Функция для поиска книг
async function searchBooks(query) {
  try {
    // Проверяем кэш
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

    // Поиск на различных сайтах
    const results = [];
    
    // --- Улучшенный поиск на flibusta.is ---
    try {
      const response = await axios.get(`http://flibusta.is/booksearch?ask=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      
      $('#main a').each((i, element) => {
        const link = $(element);
        const href = link.attr('href');
        
        if (href && href.startsWith('/b/')) {
          const title = link.text().trim();
          let author = 'Неизвестен';
          
          // Попытка найти автора в соседних элементах
          const authorNode = link.parent().nextAll('a[href^="/a/"]').first();
          if (authorNode.length) {
            author = authorNode.text().trim();
          }

          if (title && title !== 'читать' && title !== 'скачать') {
            results.push({
              title,
              author,
              description: 'Описание будет добавлено позже.',
              downloadLink: `http://flibusta.is${href}`,
              source: 'flibusta.is'
            });
          }
        }
      });
    } catch (error) {
      console.log('Ошибка при поиске на flibusta:', error.message);
    }

    // --- Улучшенный поиск на litnet.com ---
    try {
      const response = await axios.get(`https://litnet.com/ru/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      $('.book-item').each((i, element) => {
        const title = $(element).find('h4.book-title a').text().trim();
        const author = $(element).find('.author-name').text().trim();
        const description = $(element).find('.annotation-text').text().trim();
        const downloadLink = $(element).find('a.cover').attr('href');
        
        if (title && author) {
          results.push({
            title,
            author,
            description,
            downloadLink: `https://litnet.com${downloadLink}`,
            source: 'litnet.com'
          });
        }
      });
    } catch (error) {
      console.log('Ошибка при поиске на litnet:', error.message);
    }

    // --- Поиск на knigopoisk.org ---
    try {
      const response = await axios.get(`https://knigopoisk.org/search/books?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);

      $('.book-item').each((i, element) => {
        const title = $(element).find('.book-title a').text().trim();
        const author = $(element).find('.book-author a').text().trim();
        const description = $(element).find('.book-description').text().trim();
        const bookLink = $(element).find('.book-title a').attr('href');

        if (title && author) {
          results.push({
            title,
            author,
            description,
            downloadLink: `https://knigopoisk.org${bookLink}`,
            source: 'knigopoisk.org'
          });
        }
      });
    } catch (error) {
        console.log('Ошибка при поиске на knigopoisk.org:', error.message);
    }

    // Если после всех поисков ничего не найдено, возвращаем демо-данные
    if (results.length === 0) {
      results.push(
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
      );
    }

    // Сохраняем в кэш
    db.run("INSERT INTO books_cache (query, results) VALUES (?, ?)", 
      [query, JSON.stringify(results)]);

    return results;
  } catch (error) {
    console.error('Ошибка при поиске книг:', error);
    return [];
  }
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