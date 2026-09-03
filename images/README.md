# Lecture images

Screenshots and diagrams for the lectures. The lectures currently mark each spot
with a line like:

```markdown
> 🖼️ *Placeholder — `images/lecture-01/1-1-where.png` (screenshot of the result)*
```

To fill one in, save the image at exactly that path and replace the whole line with:

```markdown
![Result of the filtering query](images/lecture-01/1-1-where.png)
```

Two kinds are marked:

- **screenshot of the result** — run the query above it in the
  [playground](https://furiere.github.io/data_course_3/) and capture the result grid.
  The `A+` button in the toolbar enlarges the text first, which reads better in a
  document than a full-size screenshot scaled down.
- **diagram** — a concept picture (JOIN types, frame boundaries, order of
  execution) rather than a screenshot of this database.

To list every placeholder still outstanding:

```bash
grep -n '🖼️' lecture-*.md
```
