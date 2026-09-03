# Lesson 8. DML & DDL

*Source: «Урок 8. DML&DDL.pdf» — translated from Russian. Data values inside SQL examples and screenshots are kept as they appear in the original.*

## Contents

1. DDL (Data Definition Language)
2. DML (Data Manipulation Language)
3. Summary

---

## DDL (Data Definition Language)

DDL (Data Definition Language) describes the structure of data — that is, tables, indexes, constraints and sequences. The main DDL statements include `CREATE`, `ALTER`, `DROP` and `TRUNCATE`.

### CREATE

Creating a table:

```sql
CREATE TABLE my_table (
    id               int,
    name             text,
    birth_date       date,
    sex              text
);
```

**my_table**

| id | name | birth_date | sex |
|---|---|---|---|
| 1 | Иван | 2000-01-01 | male |
| 2 | Марья | 1997-03-18 | female |

![The created table](images/lesson08/img-002-002.png)

The syntax differs between PostgreSQL and ClickHouse.

We are covering DDL syntax in a fairly simplified way, so when working with a specific DBMS you must be sure to consult its documentation. Examples of syntax differences for different DBMSs are given below.

**PostgreSQL:**

```sql
CREATE TABLE my_table (
    id                   SERIAL PRIMARY KEY,
    name                 VARCHAR(255),
    birth_date           DATE,
    sex                  VARCHAR(6) NOT NULL,
    CONSTRAINT sex_check CHECK (sex IN ('male', 'female'))
);
```

Note that for Postgres we specify that the `id` field is not `INT` but `SERIAL PRIMARY KEY`. For `name` we specify not `TEXT` but `VARCHAR` with a limit of 255 characters. Sex has a `NOT NULL` constraint. And at the end we can additionally add a constraint requiring the sex to be 'male' or 'female'.

**ClickHouse:**

```sql
CREATE TABLE my_table
          ON CLUSTER cluster_name
(
    id              UInt64,
    name            Nullable(String),
    birth_date      Nullable(Date),
    sex             String
) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/my_table', '{replica}')
ORDER BY id;
```

ClickHouse has other nuances. First, we roll the table out to all the nodes of our ClickHouse cluster. The Replicated Merge Tree engine is specified. Inside the engine, data is sorted by the `id` field. For the fields that may be empty, `Nullable` is written.

### ALTER

`ALTER TABLE` lets you rename tables and add, modify and delete fields.

Renaming a table:

```sql
ALTER TABLE my_table
RENAME TO people;
```

**people**

| id | name | birth_date | sex |
|---|---|---|---|
| 1 | Иван | 2000-01-01 | male |
| 2 | Марья | 1997-03-18 | female |

![The renamed table](images/lesson08/img-003-003.png)

Most of the time renaming does not take long, because in this case a new table is not created and the data is not copied into it; one name is simply replaced by another by the DBMS's internal means.

Adding a new field:

```sql
ALTER TABLE people
ADD COLUMN is_pet boolean;
```

**people**

| id | name | birth_date | sex | is_pet |
|---|---|---|---|---|
| 1 | Иван | 2000-01-01 | male | NULL |
| 2 | Марья | 1997-03-18 | female | NULL |

![The new column](images/lesson08/img-004-004.png)

In all the rows that we have added, this field will take the value `NULL`.

Renaming a field:

```sql
ALTER TABLE people
ALTER COLUMN is_pet
RENAME TO with_pet;
```

**people**

| id | name | birth_date | sex | with_pet |
|---|---|---|---|---|
| 1 | Иван | 2000-01-01 | male | NULL |
| 2 | Марья | 1997-03-18 | female | NULL |

![The renamed column](images/lesson08/img-004-005.png)

Setting a default value for a field:

```sql
ALTER TABLE people
ALTER COLUMN with_pet
SET DEFAULT False;
```

![The default value](images/lesson08/img-005-006.png)

> 💡 The default value will only work for new rows. All rows that were added earlier and have the value `NULL` will remain unchanged.

### TRUNCATE

Clearing a table of records:

```sql
TRUNCATE TABLE people;
```

**people**

| id | name | birth_date | sex |
|---|---|---|---|
| *(empty)* | | | |

![The truncated table](images/lesson08/img-005-007.png)

`TRUNCATE TABLE` deletes all rows from a table very quickly. Much faster than the `DELETE FROM table` operation.

### DROP

Dropping a column:

```sql
ALTER TABLE people
DROP COLUMN with_pet;
```

**people**

| id | name | birth_date | sex |
|---|---|---|---|
| 1 | Иван | 2000-01-01 | male |
| 2 | Марья | 1997-03-18 | female |

![The table after dropping a column](images/lesson08/img-006-008.png)

Dropping a table:

```sql
DROP TABLE people;
```

> 💡 Be careful with dropping a table, because it will be very hard to restore it from a backup.

---

## DML (Data Manipulation Language)

DML (Data Manipulation Language) manipulates the data in tables. The main operations include `INSERT`, `UPDATE` and `DELETE`.

### INSERT

Adding records:

- **Values:**

```sql
INSERT INTO people (id, name, birth_date, sex)
VALUES (1, 'Иванов Иван Иванович', date '2000-01-01', 'male'),
       (2, 'Петрова Инна Николаевна', date '1998-03-18', 'female');
```

**people**

| id | name | birth_date | sex |
|---|---|---|---|
| 1 | Иванов Иван Иванович | 2000-01-01 | male |
| 2 | Петрова Инна Николаевна | 1998-03-18 | female |

![The inserted rows](images/lesson08/img-007-009.png)

- **Rows from a query:**

```sql
INSERT INTO people
SELECT id, name, date, NULL
FROM employees
WHERE species = 'Human';
```

Note that the fields selected in `SELECT` must match strictly the fields that will be in the table they are then added to. If some field is missing, you have to put, for example, `NULL` in its place.

### UPDATE

Changing data:

- **In all records of a column:**

```sql
UPDATE people
SET salary = salary * 1.1;
```

- **In filtered records:**

```sql
UPDATE people
SET name = 'Тюленев Петр Алексеевич'
WHERE id = 1;
```

**people**

| id | name | birth_date | sex |
|---|---|---|---|
| 1 | Тюленев Петр Алексеевич | 2000-01-01 | male |
| 2 | Петрова Инна Николаевна | 1998-03-18 | female |

![The updated row](images/lesson08/img-008-010.png)

### DELETE

Deleting data:

```sql
DELETE FROM people
WHERE id > 200;
```

![DELETE FROM people; → add a condition → use TRUNCATE](images/lesson08/img-008-011.png)

> 💡 It is important to remember that `DELETE` must always have a condition; otherwise it is more sensible to use `TRUNCATE`.

---

## Summary

- **DDL (Data Definition Language)** describes the structure of data — that is, tables, indexes, constraints and sequences. The main DDL statements include:
  - `CREATE TABLE` — creating a table
  - `ALTER TABLE` — renaming a table, adding, modifying and deleting fields
  - `DROP COLUMN` — dropping a field
  - `TRUNCATE TABLE` — deleting all records from a table
- **DML (Data Manipulation Language)** manipulates the data in tables. The main DML statements include:
  - `INSERT INTO` — adding records
  - `UPDATE` — changing data
  - `DELETE` — deleting data
