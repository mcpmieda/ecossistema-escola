/** Entirely invented records for disposable test databases only. */
export const ACADEMIC_FIXTURE_SQL_V1 = `
INSERT INTO gradebook.ano_letivo VALUES (2026,60000,2) ON CONFLICT DO NOTHING;
INSERT INTO gradebook.turma(id,ano,codigo,nome,etapa,turno) VALUES
  (910001,2026,'S710','SYNTHETIC ACADEMIC CLASS',6,'TESTE'),(910002,2026,'S712','SYNTHETIC NEXT CLASS',6,'TESTE');
INSERT INTO gradebook.aluno(id,ano,nome) VALUES (910001,2026,'SYNTHETIC ACADEMIC ONE'),(910002,2026,'SYNTHETIC ACADEMIC OTHER');
INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id) VALUES (2026,910001,1,910001),(2026,910001,2,910002);
INSERT INTO gradebook.professor(id,ano,nome) VALUES (910001,2026,'SYNTHETIC PRIVATE TEACHER');
INSERT INTO gradebook.disciplina(id,ano,nome) VALUES (910001,2026,'MATEMATICA'),(910002,2026,'PORTUGUES');
INSERT INTO gradebook.oferta(id,ano,turma_id,professor_id,disciplina_id) VALUES
  (910001,2026,910001,910001,910001),(910002,2026,910001,910001,910002);
INSERT INTO gradebook.instrumento(id,oferta_id,trimestre,slot,maximo,descricao)
  SELECT 910000+(o-910000)*100+t*20+s,o,t,s,
    CASE WHEN s=11 THEN CASE WHEN t=3 THEN 22000 ELSE 16500 END ELSE CASE WHEN t=3 THEN 9000 ELSE 6750 END END,
    'SYNTHETIC ASSESSMENT '||s FROM generate_series(910001,910002) o CROSS JOIN generate_series(1,3) t CROSS JOIN (VALUES (1),(2),(11)) slots(s);
INSERT INTO gradebook.nota(instrumento_id,aluno_id,valor)
  SELECT id,910001,CASE WHEN slot=1 THEN 0 ELSE 1000 END FROM gradebook.instrumento WHERE oferta_id IN (910001,910002);
INSERT INTO gradebook.fechamento(oferta_id,aluno_id,am1_fonte,am2_fonte,am3_fonte,u_fonte)
  VALUES (910001,910001,25000,NULL,0,99000),(910002,910001,24000,NULL,0,NULL);
SELECT * FROM student_portal.synchronize_profiles_v1(true);
`;
