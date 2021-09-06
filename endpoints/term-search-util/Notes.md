# The most common feature/values:

```
SELECT feature, value, array_length(word_uids, 1) as length
FROM feature_index
ORDER BY length DESC
LIMIT 10;

      feature       | value | length   
--------------------+-------+--------
 number             | sg    | 502382
 person             | A     | 347864
 pron_suffix_person | n     | 235942
 is_definite        | Y     | 211667
 gender             | m     | 204926
 number             | pl    | 179766
 part_of_speech     | verb  | 178964
 part_of_speech     | noun  | 157279
 pron_suffix_person | A     | 145484
 gender             | masc  | 141995
(10 rows)
```