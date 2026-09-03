# Lesson 3. Filtering and Sorting Data

*Source: «Урок 3. Фильтрация и сортировка данных.pdf» — translated from Russian.*

## Contents

- Filtering (WHERE)
  - Main methods of filtering text
- Sorting (ORDER BY)
- Limiting the result set (LIMIT, OFFSET)
- Code style
- Working with missing data (NULL)
- Interview questions
- Summary

---

## Filtering (WHERE)

Filtering data is one of the key tasks when working with databases. It is needed to select one or more rows by a given condition. Filtering therefore lets us concentrate only on the data we are interested in.

General form of a query with filtering:

```sql
SELECT *              -- choose the fields
  FROM table          -- choose the table
 WHERE <condition>    -- the condition
```

The expression written as the filter condition must return a boolean value (`True` or `False`). The syntax is similar to working with boolean variables:

- Equality and inequality (`=`, `<>`)
- Comparisons (`>`, `>=`, `<`, `<=`)
- The `IN` clause — checks whether a value belongs to a list of values
- The `NOT` clause — inverts a condition (`NOT IN`, `NOT BETWEEN`, `NOT LIKE`, `NOT EXISTS`, `IS NOT NULL`, and also combined conditions such as `NOT (department = 'HR' AND age >= 30)`)
- The `BETWEEN` clause — checks whether a value falls in a range

To filter by several conditions, the logical operators `AND` and `OR` are used. When using them, remember that `AND` has higher precedence than `OR`.

Example of filtering:

```sql
SELECT * FROM characters
 WHERE species = 'Human' AND status = 'Alive'
 LIMIT 10;
```

| id | name | status | species | gender |
|---|---|---|---|---|
| 1 | Rick Sanchez | Alive | Human | Male |
| 2 | Morty Smith | Alive | Human | Male |
| 3 | Summer Smith | Alive | Human | Female |

![Result of the filtering query](images/lesson03/img-003-001.png)

If several conditions are used in the filter, parentheses can be used to state the order of operations explicitly (without them the DBMS will execute the operations according to the precedence rules we looked at in the previous lesson).

Using parentheses is important for executing queries correctly and getting the expected results; it also improves readability. So it is better to always use them, even when the order of execution would be the same with and without them.

The following two queries return the same result, but the query with explicit precedence given by parentheses is easier to read and interpret:

```sql
SELECT * FROM employees
 WHERE department = 'Sales' OR department = 'Marketing' AND salary > 50000;
```

```sql
SELECT * FROM employees
 WHERE department = 'Sales' OR (department = 'Marketing' AND salary > 50000);
```

The query selects all employees from the Sales department, plus those employees from the Marketing department whose salary is greater than 50000.

In the next query the parentheses have changed the order of operations. The query selects employees who work either in the Sales department or in the Marketing department, and whose salary is greater than 50000:

```sql
SELECT * FROM employees
 WHERE (department = 'Sales' OR department = 'Marketing') AND salary > 50000;
```

> 💡 To avoid mistakes, it is recommended to set the precedence of logical operators explicitly with parentheses.

### Main methods of filtering text

In SQL, special attention should be paid to filtering character data types, which offers many options for searching and selecting rows that satisfy particular text conditions. Using comparison operators, patterns, built-in functions and logical operators lets you build flexible and powerful queries for working with text data.

The most frequently used ones are:

**1. The equality (`=`) and inequality (`<>` or `!=`) operators**

The equality operator is used to find rows that exactly match the given text.

```sql
SELECT * FROM customers
 WHERE city = 'New York';
```

This query selects all customers whose city of residence is listed as "New York".

The inequality operator is used to find rows that do not match the given text.

```sql
SELECT * FROM customers
 WHERE city != 'New York';
```

This query selects all customers whose city of residence is not "New York".

**2. The `LIKE` operator**

The `LIKE` operator is used to search for rows by pattern. It uses two special characters:

- `%` : replaces any number of characters (including zero characters).
- `_` : replaces exactly one character.

Examples:

```sql
SELECT * FROM customers
 WHERE name LIKE 'J%';
```

This query selects all customers whose names begin with the letter "J".

```sql
SELECT * FROM customers
 WHERE email LIKE '%@gmail.com';
```

This query selects all customers whose email addresses end with "@gmail.com".

```sql
SELECT * FROM products
 WHERE code LIKE 'A_1';
```

This query selects all products whose code begins with the letter "A", has any single character in second place, and ends with "1".

**3. The `ILIKE` operator (in some DBMSs, for example PostgreSQL)**

In some database management systems the `ILIKE` operator is used for case-insensitive pattern search. For example, in PostgreSQL:

```sql
SELECT * FROM customers
 WHERE name ILIKE 'j%';
```

This query will select all customers whose names begin with the letter "j" or "J".

**4. The `IN` operator**

The `IN` operator lets you filter rows that match one of the values in a list.

```sql
SELECT * FROM customers
 WHERE city IN ('New York', 'Los Angeles', 'Chicago');
```

This query selects all customers who live in one of the three listed cities.

**5. Using functions for working with text**

Many DBMSs provide built-in functions for working with text, such as `LOWER()`, `UPPER()`, `TRIM()`, `SUBSTRING()` and others. These functions can be used in `WHERE` conditions to build more complex filters.

Examples:

- Converting text to lower case for a case-insensitive search:

```sql
SELECT * FROM customers
 WHERE LOWER(name) = 'john doe';
```

- Finding rows that contain a particular substring:

```sql
SELECT * FROM courses
 WHERE SUBSTRING(description, 1, 4) = 'Data';
```

- Removing spaces from the beginning and end of a string:

```sql
SELECT * FROM customers
 WHERE TRIM(name) = 'John Doe';
```

### Combining conditions

You can combine different text filtering conditions with the logical operators `AND`, `OR` and `NOT` to build complex queries.

Example:

```sql
SELECT * FROM customers
 WHERE (city = 'New York' OR city = 'Los Angeles')
   AND name LIKE 'J%'
   AND email LIKE '%@gmail.com';
```

This query selects all customers who live in New York or Los Angeles, whose names begin with the letter "J" and whose email addresses end with "@gmail.com".

When an SQL query contains computed fields (fields whose values are calculated while the query runs), filtering by such a field requires duplicating the computed expression. Using an alias in this case will cause an error in the DBMS.

Example of correct usage:

```sql
SELECT
    product_id,
    price,
    discount,
    price * discount AS discounted_price
FROM
    products
WHERE
    price * discount > 3000;   -- the filter condition duplicates the computed expression
```

Example of incorrect usage:

```sql
SELECT
    product_id,
    price,
    discount,
    price * discount AS discounted_price
FROM
    products
WHERE
    discounted_price > 3000;   -- using the alias will cause an error
```

> 💡 Do not use aliases for filtering by computed fields in SQL queries.

---

## Sorting (ORDER BY)

Sorting data lets you order rows in ascending or descending order. Sorting is done by one or more columns specified in the SQL query. The `ORDER BY` clause is used for this:

- `ASC` (used by default) — sorting in ascending order
- `DESC` — sorting in descending order

![Ascending and descending sorting](images/lesson03/img-009-002.png)

General form of a query with sorting:

```sql
   SELECT *                          -- choose the fields
     FROM table                      -- choose the table
    WHERE <condition>                -- filter condition
 ORDER BY <field_1> DESC, <field_2>  -- sort by field_1 descending
```

To specify the sort field you can use the field name, its alias, or the ordinal number of the field (starting from 1) among all output fields listed in `SELECT`.

Numbers are sorted in ascending order (from smaller to larger), and character data types are sorted in lexicographic order.

---

## Limiting the result set (LIMIT, OFFSET)

To limit the number of rows returned, the `LIMIT` clause is used. Combined with `OFFSET` it allows pagination (splitting data into pages for convenient display and management of a large volume of information).

General form of a query with a limited result set:

```sql
   SELECT *                        -- choose the fields
     FROM table                    -- choose the table
    WHERE <condition>              -- the condition
 ORDER BY <field_1>, <field_2>     -- sorting
    LIMIT n1                       -- return n1 rows
   OFFSET n2                       -- skip the first n2 rows
```

For example, `LIMIT 10 OFFSET 10` will select 10 rows starting from the 11th.

![How LIMIT and OFFSET work](images/lesson03/img-010-003.png)

Example of using sorting and limiting the result set:

```sql
SELECT *
  FROM locations
 WHERE type in ('TV', 'Fantasy town', 'Planet')
 ORDER BY name LIMIT 10 OFFSET 10;
```

| id | name | type | dimension |
|---|---|---|---|
| 69 | Earth (C-35) | Planet | Dimension C-35 |
| 23 | Earth (C-500A) | Planet | Dimension C-500A |
| 74 | Earth (Chair Dimension) | Planet | Chair Dimension |
| 59 | Earth (D716) | Planet | Dimension D716 |

![Result of the sorting query](images/lesson03/img-011-004.png)

---

## Code style

A good style of writing SQL queries makes them more readable and maintainable. You should follow these simple rules:

- Statements are written in capital letters (SELECT, FROM, WHERE, ORDER BY)

> 💡 Using upper case for keywords is a matter of style and of team conventions. It is not a mandatory requirement of SQL, but it is a widely accepted convention that helps improve the readability and maintainability of code.

- Each statement starts on a new line
- Using spaces for alignment improves readability (the "corridor" rule, where key elements are aligned and easy to distinguish)
- In complex queries you can use comments for better readability:
  - `--` is used for a single-line comment
  - `/* */` is used for a multi-line comment

Example of writing an SQL query using the "corridor" rule:

```sql
  SELECT *
    FROM locations
   WHERE type in ('TV', 'Fantasy town', 'Planet')
ORDER BY name LIMIT 10 OFFSET 10;
```

![The "corridor" rule](images/lesson03/img-012-005.png)

---

## Working with missing data (NULL)

`NULL` is a special value that denotes the absence of data in a table cell. It differs from an empty string or a zero value and requires a special approach:

- **`NULL` does not take part in ordinary comparisons.** Instead of comparison operators you must use the `IS NULL` and `IS NOT NULL` constructs, which return `True` or `False`.

```sql
-- Select all employees who have no email address specified
SELECT *
  FROM employees
 WHERE email IS NULL;

-- Select all employees who do have an email address specified
SELECT *
  FROM employees
 WHERE email IS NOT NULL;
```

- If arithmetic operations use fields with `NULL` values in some rows, the result of the calculation for those rows will also be `NULL`.

```sql
-- Calculating the final price taking the discount into account
SELECT
     sale_id,
     price,
     discount,
     price - discount AS final_price
FROM
     sales;
-- For rows with NULL in discount, the result in final_price will also be NULL
```

- The `COALESCE` function returns the first non-`NULL` value among the arguments passed to it. It is applied to every value in the column, and if that value turns out to be `NULL` it replaces it with the value given as the second argument. Otherwise the function simply returns the column value.

```sql
-- Selecting employee data, using COALESCE to handle NULLs
SELECT
    employee_id,
    first_name,
    COALESCE(last_name, '') AS last_name
FROM
    employees;
-- If last_name is NULL, an empty string is returned
```

- **Sorting.** In different DBMSs `NULL` may be sorted as the first or as the last value. To state this explicitly you must use `NULLS FIRST` or `NULLS LAST`.

```sql
-- Sorting products by price with NULLs first
SELECT
    product_id,
    product_name,
    price
FROM
    products
ORDER BY
    price NULLS FIRST;
```

Example of handling `NULL` with the `COALESCE` function:

```sql
SELECT id, name, type,
       COALESCE(dimension, 'unknown')
  FROM locations
 WHERE type in ('TV', 'Fantasy town', 'Planet');
```

| id | name | type | coalesce |
|---|---|---|---|
| 1 | Earth (C-137) | Planet | Dimension C-137 |
| 4 | Worldender's lair | Planet | unknown |
| 6 | Interdimensional Cable | TV | unknown |
| 8 | Post-Apocalyptic Earth | Planet | Post-Apocalyptic Dimension |
| 9 | Purge Planet | Planet | Replacement Dimension |
| 10 | Venzenulon 7 | Planet | unknown |
| 11 | Bepis 9 | Planet | unknown |
| 12 | Cronenberg Earth | Planet | Cronenberg Dimension |

![Result of the COALESCE query](images/lesson03/img-015-006.png)

---

## Interview questions

**1. What will `NULL = NULL` return?**

Answer: `NULL = NULL` returns `NULL`, because a comparison with `NULL` is always undefined.

**2. What will `NULL OR TRUE` return?**

Answer: `NULL OR TRUE` returns `TRUE`, because the `OR` operator returns true if at least one of the conditions is true.

**3. What will `NULL AND TRUE` return?**

Answer: `NULL AND TRUE` returns `NULL`, because the result depends on the unknown value `NULL`.

**4. How is `NULL` handled during sorting, and how can this be changed?**

Answer: In different DBMSs `NULL` may be sorted differently. To change the order, use `NULLS FIRST` or `NULLS LAST`.

---

## Summary

- To select rows by a given condition, you need to filter the data in the query with the `WHERE` clause. To combine several conditions, `AND` and `OR` are used. `AND` has higher precedence than `OR`. To set precedence explicitly, logical expressions are placed in parentheses.
- To sort data in a query, the `ORDER BY` clause is used, followed by the sort fields and the order (`ASC` — ascending, `DESC` — descending).
- To limit the number of rows returned, the `LIMIT` and `OFFSET` clauses are used, which allow paginating the output.
- It is considered good practice when writing code to follow the generally accepted informal rules:
  - writing statements in capital letters
  - starting each statement on a new line
  - using alignment for readability
- `NULL` denotes the absence of data (as opposed to the digit 0 or the empty string `''`). Specifics of working with `NULL`:
  - For comparisons, the operators `IS NULL` and `IS NOT NULL` are used
  - If `NULL` takes part as one of the operands in an arithmetic operation, the result will also be `NULL`
  - To replace `NULL` values with constant values, the `COALESCE` function is used
  - When sorting fields, `NULL` values may be sorted as the first or the last value depending on the DBMS

By the end of this lesson you can write an SQL query using the following clauses:

| Clause | Description |
|---|---|
| `SELECT` | The main operator for querying data from one or several tables. Lets you select specific columns and rows based on given conditions. |
| `FROM` | Points to the table in the database that the query addresses |
| `WHERE` | Specifies the conditions by which rows will be selected |
| `ORDER BY` | Orders the rows in the query result by one or several columns. Can be used for sorting in ascending (`ASC`) or descending (`DESC`) order |
| `LIMIT` and `OFFSET` | `LIMIT` restricts the number of rows returned. `OFFSET` skips the specified number of rows before returning the remaining rows |
