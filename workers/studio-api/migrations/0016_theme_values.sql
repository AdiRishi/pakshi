-- Brands store every theme value instead of a preset and the values changed
-- on top of it. Each revision's theme becomes its preset's values with its
-- changes applied, so it resolves exactly as before. `resolved` is unchanged.
update brand_revisions
set theme = json_patch(
  '{"brandColor":"#1f5c44","neutral":"cool","fonts":{"heading":"source-sans-3","body":"source-sans-3"},"typeScale":"medium","headingWeight":700,"radius":"small","shadow":"flat","density":"comfortable","imageCorners":"square","motion":false}',
  json_extract(theme, '$.changes')
)
where json_extract(theme, '$.preset') = 'civic';

update brand_revisions
set theme = json_patch(
  '{"brandColor":"#125ca1","neutral":"warm","fonts":{"heading":"literata","body":"work-sans"},"typeScale":"medium","headingWeight":600,"radius":"small","shadow":"soft","density":"comfortable","imageCorners":"rounded","motion":true}',
  json_extract(theme, '$.changes')
)
where json_extract(theme, '$.preset') = 'editorial';

update brand_revisions
set theme = json_patch(
  '{"brandColor":"#97271b","neutral":"neutral","fonts":{"heading":"bricolage-grotesque","body":"onest"},"typeScale":"large","headingWeight":700,"radius":"large","shadow":"raised","density":"spacious","imageCorners":"extra-rounded","motion":true}',
  json_extract(theme, '$.changes')
)
where json_extract(theme, '$.preset') = 'bold';
