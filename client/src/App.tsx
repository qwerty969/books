import React, { useState } from 'react';
import { Search, BookOpen, Download, User, Info } from 'lucide-react';
import axios from 'axios';

interface Book {
  title: string;
  author: string;
  description: string;
  downloadLink: string;
  source: string;
}

function App() {
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchBooks = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
      setBooks(response.data.results);
    } catch (err) {
      setError('Ошибка при поиске книг. Попробуйте еще раз.');
      console.error('Ошибка поиска:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchBooks();
    }
  };

  const downloadBook = async (book: Book) => {
    try {
      // Здесь будет логика скачивания
      alert(`Скачивание книги "${book.title}" будет доступно в полной версии`);
    } catch (err) {
      alert('Ошибка при скачивании');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <BookOpen className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Book Finder</h1>
            </div>
            <p className="text-sm text-gray-500">Поиск книг на русском языке</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Найдите свою следующую книгу
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Поиск по названию, автору или жанру
          </p>
          
          <div className="max-w-2xl mx-auto">
            <div className="flex shadow-lg rounded-lg overflow-hidden">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Введите название книги, автора или жанр..."
                className="flex-1 px-6 py-4 text-lg search-input focus:outline-none"
              />
              <button
                onClick={searchBooks}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 px-8 py-4 text-white font-semibold transition-colors duration-200"
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Поиск...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Search className="h-5 w-5" />
                    <span>Найти</span>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 text-red-800">
              <Info className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Results */}
        {books.length > 0 && (
          <div className="space-y-6">
            <h3 className="text-2xl font-semibold text-gray-900">
              Найденные книги ({books.length})
            </h3>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {books.map((book, index) => (
                <div key={index} className="bg-white rounded-lg shadow-md book-card p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                        {book.title}
                      </h4>
                      <div className="flex items-center text-sm text-gray-600 mb-2">
                        <User className="h-4 w-4 mr-1" />
                        <span>{book.author}</span>
                      </div>
                      <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full inline-block">
                        {book.source}
                      </div>
                    </div>
                  </div>
                  
                  {book.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                      {book.description}
                    </p>
                  )}
                  
                  <button
                    onClick={() => downloadBook(book)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                  >
                    <Download className="h-4 w-4" />
                    <span>Скачать</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && books.length === 0 && query && !error && (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              Книги не найдены
            </h3>
            <p className="text-gray-600">
              Попробуйте изменить поисковый запрос или использовать другие ключевые слова
            </p>
          </div>
        )}

        {/* Initial State */}
        {!loading && books.length === 0 && !query && (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              Начните поиск
            </h3>
            <p className="text-gray-600">
              Введите название книги, автора или жанр в поле поиска выше
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-600">
            <p>&copy; 2024 Book Finder. Разработано Артёмом Михайловым.</p>
            <p className="text-sm mt-2">
              Это демо-версия приложения. В полной версии будет доступно больше функций.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App; 