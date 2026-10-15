/*
 * Atom Lite: совместимость нативных модулей с новыми macOS SDK.
 *
 * Начиная с Xcode 16 (SDK 15.x) тип iconv_t больше не void*, а указатель
 * на неполный тип struct __tag_iconv_t *. Старый C++-код, написанный под
 * прежнее объявление, перестаёт компилироваться: неявное приведение
 * void* -> iconv_t больше не работает.
 *
 * Пример — superstring 2.4.4, ядро текстовых буферов Atom:
 *
 *   src/core/encoding-conversion.cc:64:  error: no matching function
 *          for call to 'iconv_close'
 *   src/core/encoding-conversion.cc:121: error: cannot convert
 *          '__tag_iconv_t**' to 'iconv_t'
 *
 * Заголовок подключается принудительно через -include в CFLAGS/CXXFLAGS
 * (см. .github/workflows/build.yml) и возвращает прежнее поведение:
 * аргументы iconv() и iconv_close() явно приводятся к iconv_t.
 * На старых SDK и на других системах эти приведения безвредны.
 *
 * Проверено локально: с этим заголовком src/core/encoding-conversion.cc
 * компилируется против макета нового SDK, без него — падает ровно на тех
 * же двух строках, что и в CI.
 */
#ifndef ATOM_LITE_MACOS_ICONV_COMPAT_H_
#define ATOM_LITE_MACOS_ICONV_COMPAT_H_

#include <iconv.h>

/* Скобки вокруг имени функции не дают макросу развернуть сам себя. */
#define iconv_close(x) (iconv_close)((iconv_t)(x))
#define iconv(x, ...) (iconv)((iconv_t)(x), __VA_ARGS__)

#endif /* ATOM_LITE_MACOS_ICONV_COMPAT_H_ */
