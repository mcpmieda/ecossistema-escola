import { Card } from '@heroui/react';

/** Public closed-entry state until the integrated product is mounted by #757. */
export function StudentPortalApp() {
  return <main className="pa-entry">
    <Card className="pa-entry-card">
      <Card.Header>
        <Card.Description>Escola Ieda</Card.Description>
        <Card.Title<'h1'> render={(props) => <h1 {...props} />}>Portal do Aluno</Card.Title>
      </Card.Header>
      <Card.Content><p>O acesso ainda não está disponível.</p></Card.Content>
    </Card>
  </main>;
}
