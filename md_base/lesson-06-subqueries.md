# Lesson 6. Subqueries

*Source: «Урок 6. Подзапросы.pdf» — translated from Russian.*

## Contents

1. What is a subquery?
2. Subqueries in FROM
3. Subqueries in JOIN
4. Subqueries in SELECT
5. Subqueries in WHERE
6. Subqueries in HAVING
7. Subqueries in ORDER BY
8. Common Table Expression (CTE)
9. Interview questions
10. Summary

---

## What is a subquery?

A **subquery** is a query inside another query. For example, we can compute an aggregate over one table and then use the resulting data in another query against another table. Subqueries can be used in various parts of the main query, such as `SELECT`, `FROM`, `JOIN`, `WHERE`, `HAVING` and `ORDER BY`.

### Types of subqueries

**1. Non-correlated subqueries** are subqueries that can be executed independently of the outer query. Such a subquery is executed once, and its result is used in the outer query.

Suppose we have an `orders` table and a `customers` table. The `orders` table contains information about orders, including the order ID, the customer ID and the order amount. The `customers` table contains information about customers, including the customer ID and the customer name.

```sql
SELECT name
   FROM customers
WHERE customer_id IN (
          SELECT customer_id
            FROM orders
           WHERE order_amount > 1000
);
```

The query above selects the names of customers who have placed orders for more than 1000. The subquery `SELECT customer_id FROM orders WHERE order_amount > 1000` is executed once and returns a list of customer IDs, which is then used in the outer query.

**2. Correlated subqueries** are subqueries that reference the outer table, that is, they depend on the outer query. For every row in the outer query, the subquery returns a result that depends on the value of that row. Thus a correlated subquery is executed many times — once for each row of the outer query — which affects performance.

Suppose we have two tables: `employees` and `departments`. The `employees` table contains information about employees, including their ID, name, salary and department ID. The `departments` table contains information about departments, including the department ID and the department name.

```sql
SELECT e1.name, e1.salary
  FROM employees e1
WHERE e1.salary > (
         SELECT AVG(e2.salary)
         FROM employees e2
         WHERE e2.department_id = e1.department_id
);
```

The query above selects the employees whose salary is higher than the average salary in their department. The subquery inside `WHERE` is executed for every row of the outer query `employees e1`.

**Scalar queries** are also singled out as a separate group. These are queries that return a single value — for example, `SELECT AVG(column) FROM table;`.

---

## Subqueries in FROM

```sql
SELECT *
  FROM (SELECT * FROM table) AS t1;
```

This is a non-correlated subquery, in which the outer `SELECT` obtains data from the inner subquery.

> 💡 Some DBMSs require subqueries used in `FROM` to have aliases. Using aliases is a useful habit!

Example of a subquery in `FROM`:

```sql
SELECT substr(episode_id, 1, 3) AS season, COUNT(DISTINCT name) AS char_cnt
  FROM
   (SELECT e.episode_id, c.name
    FROM episodes AS e
    JOIN char_ep AS ce
        ON e.id = ce.episode_id
    JOIN characters AS c
        ON ce.character_id = c.id
    ) AS epis_char
GROUP BY substr(episode_id, 1, 3)
ORDER BY 1
```

| season | char_cnt |
|---|---|
| S01 | 188 |
| S02 | 167 |
| S03 | 195 |
| S04 | 177 |
| S05 | 162 |

![Result of the FROM subquery](images/lesson06/img-004-002.png)

---

## Subqueries in JOIN

```sql
SELECT *
  FROM table1 AS t1
  JOIN (SELECT * FROM table2) AS t2
    ON t1.id = t2.id;
```

Using a subquery in the `JOIN` section lets you join a table with the results of a subquery.

Let us complicate the previous query and add a subquery in `JOIN`:

```sql
SELECT epis_char.season,
    COUNT(DISTINCT ep.episode_id) AS ep_cnt,
    COUNT(DISTINCT epis_char.name) AS char_cnt
  FROM
   (SELECT substr(e.episode_id, 1, 3) AS season, c.name
    FROM episodes AS e
    JOIN char_ep AS ce
        ON e.id = ce.episode_id
    JOIN characters AS c
        ON ce.character_id = c.id
    ) AS epis_char
  JOIN episodes AS ep ON substr(ep.episode_id, 1, 3) = epis_char.season
GROUP BY epis_char.season
ORDER BY 1
```

| season | ep_cnt | char_cnt |
|---|---|---|
| S01 | 11 | 188 |
| S02 | 10 | 167 |
| S03 | 10 | 195 |
| S04 | 10 | 177 |
| S05 | 10 | 162 |

![Result of the JOIN subquery](images/lesson06/img-005-003.png)

---

## Subqueries in SELECT

Non-correlated subquery:

```sql
SELECT id, name, (SELECT avg(price) FROM table2) AS new_column
  FROM table;
```

Above we use a subquery to add one more field to the main query. The subquery must be scalar, otherwise the DBMS will not understand which of the values returned by the subquery should be used in a particular row, and will return an error.

> 💡 A non-correlated subquery in `SELECT` must be scalar.

Correlated subquery:

```sql
SELECT name,
       (SELECT COUNT(1)
          FROM orders
         WHERE orders.employee_id = employees.employee_id) AS order_cnt
  FROM employees;
```

In the query above the subquery uses data from the outer query for filtering, which joins the inner and the outer tables.

Example of a subquery in `SELECT`:

```sql
SELECT epis_char.season,
    (SELECT COUNT(ep.episode_id)
       FROM episodes AS ep
        WHERE substr(ep.episode_id, 1, 3) = epis_char.season) AS ep_cnt,
    (SELECT COUNT(1) FROM episodes) AS all_ep_cnt,
    COUNT(DISTINCT epis_char.name) AS char_cnt
  FROM
   (SELECT substr(e.episode_id, 1, 3) AS season, c.name
       FROM episodes AS e
       JOIN char_ep AS ce
         ON e.id = ce.episode_id
       JOIN characters AS c
         ON ce.character_id = c.id
     ) AS epis_char
GROUP BY epis_char.season
```

| season | ep_cnt | all_ep_cnt | char_cnt |
|---|---|---|---|
| S01 | 11 | 51 | 188 |
| S02 | 10 | 51 | 167 |
| S03 | 10 | 51 | 195 |
| S04 | 10 | 51 | 177 |
| S05 | 10 | 51 | 162 |

![Result of the SELECT subquery](images/lesson06/img-006-004.png)

---

## Subqueries in WHERE

### Non-correlated subquery

```sql
SELECT *
  FROM table1
  WHERE price > (SELECT AVG(price) FROM table2);
```

In the query above, filtering is done by a constant value returned by a scalar subquery (we select from the table all products whose price is above the average).

### Correlated subquery

```sql
SELECT *
  FROM product_price AS pp
  WHERE
     pp.price = (
              SELECT min(ppm.price)
              FROM product_price AS ppm
              WHERE ppm.product_id = pp.product_id
      )
  ORDER BY pp.product_id, pp.price, pp.store_id;
```

The query above selects only the records with the minimum price for each product. Filtering is done so that the price in the outer table equals the minimum price in the inner table when the `product_id` values are equal.

### Multi-column subquery

```sql
SELECT employee_id, name, department_id
   FROM employees
  WHERE (department_id, location) =
                (SELECT department_id, location
                   FROM departments
                  WHERE department_id = 101);
```

A multi-column subquery in `WHERE` is used to compare two or more fields with a subquery. In the example above we compare the department ID and its location with what the filtered subquery returns to us. This is an example of a non-correlated subquery.

### Clauses in WHERE for subqueries with one field and several records

**`IN`** — checks whether a value is contained in the results of the subquery. Returns `TRUE` if the field value is present in the subquery result, otherwise `FALSE`.

```sql
SELECT *
    FROM table1
   WHERE id IN (SELECT id FROM table2);
```

Above is an example of a non-correlated subquery. In the outer query, filtering is performed that keeps only the records whose `id` is present in the subquery result.

**`EXISTS`** — checks for the presence of rows in the subquery. Returns `TRUE` if the subquery returns at least one row, otherwise `FALSE`.

```sql
SELECT *
  FROM table1
   WHERE EXISTS (SELECT id
                   FROM table2
                   WHERE table2.name = table1.name);
```

From table 1 we select the data for which table 2 has an `id` whose name in table 2 equals the name in table 1. In other words, we join the tables and check whether the second table has at least one ID we need, and if it does, the condition is considered satisfied. `EXISTS` makes sense when the query is correlated.

**`ANY`/`SOME`** — used to compare a value with any value from the subquery. Returns `TRUE` if the condition holds for at least one value in the set, otherwise `FALSE`.

```sql
SELECT employee_id, name, salary
    FROM employees
   WHERE salary > ANY (SELECT salary FROM employees WHERE department_id = 10);
```

In the query above we filter records so that the salary is greater than that of at least one of the employees of department 10.

`ANY` and `SOME` are completely identical clauses; their behaviour does not differ in any way. Some DBMSs handle both clauses, and some handle only one of them — either only `ANY` or only `SOME`.

**`ALL`** — used to compare a value with all values in the subquery. Returns `TRUE` if the condition holds for all values in the set, otherwise `FALSE`.

```sql
SELECT employee_id, name, salary
     FROM employees
    WHERE salary > ALL (SELECT salary FROM employees WHERE department_id = 10);
```

In the query above we filter records so that the salary is greater than that of every one of the employees of department 10.

Example of a subquery in `WHERE`:

```sql
SELECT *
     FROM characters
    WHERE EXISTS (SELECT 1
                         FROM char_loc
                        WHERE location_id = (SELECT id FROM locations WHERE name = 'Earth (C-137)')
                         AND char_loc.character_id = characters.id);
```

| id | name | status | species | type | gender | origin_id |
|---|---|---|---|---|---|---|
| 38 | Beth Smith | Alive | Human | | Female | 1 |
| 45 | Bill | Alive | Human | | Male | 1 |
| 71 | Conroy | Dead | Robot | | | 20 |
| 82 | Cronenberg Rick | | Cronenberg | | Male | 12 |
| 83 | Cronenberg Morty | | Cronenberg | | Male | 12 |
| 92 | Davin | Dead | Human | | Male | 1 |

![Result of the WHERE subquery](images/lesson06/img-009-005.png)

---

## Subqueries in HAVING

When a subquery is used in the `HAVING` block, only those records are selected whose aggregates are present in the subquery, or for which the result of the comparison with the subquery returns `TRUE` (the subquery must then return only one value). Example of a non-correlated subquery in the `HAVING` block:

```sql
SELECT id, SUM(price) AS sm
   FROM table1
  GROUP BY id
HAVING SUM(price) > (SELECT AVG(price) FROM table1);
```

Example of a subquery in `HAVING`:

```sql
SELECT substr(episode_id, 1, 3) AS season,
       COUNT(1) AS cnt
   FROM episodes
  GROUP BY substr(episode_id, 1, 3)
HAVING COUNT(1) < (SELECT COUNT(1) FROM episodes WHERE episode_id like 'S01%');
```

| season | cnt |
|---|---|
| S03 | 10 |
| S04 | 10 |
| S02 | 10 |
| S05 | 10 |

![Result of the HAVING subquery](images/lesson06/img-010-006.png)

---

## Subqueries in ORDER BY

Using a correlated subquery in the `ORDER BY` block lets you compute a sorting value for every row.

```sql
SELECT employee_id, name, salary, department_id
  FROM employees
  ORDER BY (SELECT AVG(salary)
               FROM employees AS e2
              WHERE e2.department_id = employees.department_id);
```

The query above retrieves information about employees and sorts the results depending on the average salary of the departments those employees belong to. The subquery is executed for every row of the main query and computes the average salary (`AVG(salary)`) for all employees working in the same department as the current employee in the main query's row.

> 💡 Using non-correlated subqueries in the `ORDER BY` block has no practical meaning, since sorting by a constant will not change the order of rows; the resulting order will be determined by other factors, such as the order in which rows appear in the source table, if that is defined, or the order in which the database server returns the rows.

Example of a subquery in `ORDER BY`:

```sql
SELECT *
   FROM characters
  ORDER BY (
           SELECT COUNT(1)
               FROM char_ep
               WHERE char_ep.character_id = characters.id
           ) DESC;
```

| id | name | status | species | type | gender | origin_id |
|---|---|---|---|---|---|---|
| 1 | Rick Sanchez | Alive | Human | | Male | 1 |
| 2 | Morty Smith | Alive | Human | | Male | |
| 4 | Beth Smith | Alive | Human | | Female | 20 |
| 3 | Summer Smith | Alive | Human | | Female | 20 |
| 5 | Jerry Smith | Alive | Human | | Male | 20 |
| 180 | Jessica | Alive | Human | Time God | Female | 20 |

![Result of the ORDER BY subquery](images/lesson06/img-012-007.png)

---

## Common Table Expression (CTE)

A CTE (Common Table Expression) lets you move a subquery outside the main query. It is declared with the `WITH` keyword and can be used several times, but only within one overall query.

```sql
WITH cte_name AS (
      SELECT id, name, count FROM table
)
SELECT *
    FROM table1
    JOIN cte ON table1.id = cte.id;
```

In the example above, after the `WITH` clause the name of the CTE is given, which should be meaningful for understanding the contents of the query. Inside the CTE a query is placed whose results can later be used in `FROM`, `JOIN` and other operators.

### Advantages of a CTE

1. **Improved readability:** splitting a complex query into more understandable parts.
2. **Optimization:** the ability to use the CTE's results several times without re-executing the subquery.

### Example of optimization with a CTE

```sql
WITH cte AS (
       SELECT city, country, date, weather FROM table
)
SELECT weather
     FROM cte
    WHERE country = 'Russia'
UNION
SELECT weather
     FROM cte
    WHERE country = 'Peru';
```

In the example above, the subquery is executed by the DBMS once but used twice. This reduces the amount of resources needed to execute the query.

There can be several CTEs in one query; in that case the `WITH` clause is written only once, and the CTEs are listed separated by commas.

```sql
WITH cte AS (
       SELECT id, name, count FROM table
),
cte2 AS (
    SELECT id, name, SUM(count) FROM cte GROUP BY id, name
)
SELECT *
     FROM table1
     JOIN cte2 ON table1.id = cte2.id;
```

In the example above the second CTE refers to the first. This is quite concise and makes it possible to understand what happens in the first CTE, what happens in the second CTE (which uses the results of the first) and what happens in the `SELECT` itself, which is built on the basis of the second CTE.

### The difference between a CTE and temporary tables

- A **temporary table** is created by the user and exists until the session ends (until the connection to the DBMS is closed). The user can use the temporary table for the whole time they spend in the session.
- A **CTE** exists only within the execution of the query. The user can use it many times inside the query, but as soon as the query has returned the data to us, the CTE is removed from the DBMS's memory.

Example using a CTE:

```sql
WITH epis_char AS
    (SELECT substr(e.episode_id, 1, 3) AS season, c.name
     FROM episodes AS e
     JOIN char_ep AS ce
         ON e.id = ce.episode_id
     JOIN characters AS c
          ON ce.character_id = c.id
     )
     SELECT epis_char.season,
      (SELECT COUNT(ep.episode_id)
          FROM episodes AS ep
          WHERE substr(ep.episode_id, 1, 3) = epis_char.season) AS ep_cnt,
      (SELECT COUNT(1) FROM episodes) AS all_ep_cnt,
      COUNT(DISTINCT epis_char.name) AS char_cnt
    FROM epis_char
GROUP BY epis_char.season
ORDER BY 1;
```

| season | ep_cnt | all_ep_cnt | char_cnt |
|---|---|---|---|
| S01 | 11 | 51 | 188 |
| S02 | 10 | 51 | 167 |
| S03 | 10 | 51 | 195 |
| S04 | 10 | 51 | 177 |
| S05 | 10 | 51 | 162 |

![Result of the CTE query](images/lesson06/img-014-008.png)

---

## Interview questions

**1. What is the difference between correlated and non-correlated subqueries?**

- Non-correlated subqueries can be executed independently of the outer query
- Correlated subqueries depend on data from the outer query

**2. How do EXISTS, SOME, ALL and ANY work?**

- `EXISTS` checks for the presence of at least one row in the subquery
- `SOME` and `ANY` compare a field value with any value from the subquery
- `ALL` compares a field value with all values in the subquery

**3. What is a scalar subquery?**

- A subquery that returns a single value

**4. What happens if a subquery in WHERE returns NULL?**

- The condition will not be satisfied, since `NULL` is neither true nor false. Therefore the outer query will return no rows

**5. Can a subquery in ORDER BY be non-correlated?**

- Yes, technically it can, but it will not affect the sorting

**6. What is a CTE used for?**

- To improve readability and to optimize queries

**7. How does a CTE differ from a temporary table?**

- A temporary table exists until the user ends the session, while a CTE exists only within the query being executed

**8. Can a CTE reference another CTE inside a query?**

- Yes, it can; this improves readability

---

## Summary

- A subquery is a query inside another query
- Types of subqueries:
  - **Non-correlated subqueries** — subqueries that can be executed independently of the outer query
  - **Correlated subqueries** — subqueries that reference the outer table, that is, they depend on the outer query
  - **Scalar queries** — queries that return a single value
- Subqueries can be used in the `SELECT`, `FROM`, `JOIN`, `WHERE`, `HAVING` and `ORDER BY` blocks
- Some DBMSs require subqueries used in `FROM` to have aliases
- Clauses in WHERE with subqueries:
  - `IN` — checks whether a value is contained in the results of the subquery
  - `EXISTS` — checks for the presence of rows in the subquery
  - `ANY`/`SOME` — used to compare a value with any value from the subquery
  - `ALL` — used to compare a value with all values in the subquery
- A CTE (Common Table Expression) lets you move a subquery outside the main query. It is declared with the `WITH` keyword and can be used several times, but only within one overall query
- Advantages of a CTE:
  - **Improved readability:** splitting a complex query into more understandable parts
  - **Optimization:** the ability to use the CTE's results several times without re-executing the subquery
- The difference between a CTE and temporary tables:
  - A temporary table is created by the user and exists until the session ends (until the connection to the DBMS is closed)
  - A CTE exists only within the execution of the query
