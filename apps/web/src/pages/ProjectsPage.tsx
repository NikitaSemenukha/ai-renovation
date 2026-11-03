import { Button, Card, Col, Empty, Popconfirm, Progress, Row, Typography } from 'antd';
import { Link } from 'react-router';
import { completenessPercent } from '@air/domain';
import { GOAL_LABELS } from '../labels';
import { useProjects } from '../store/projectsStore';

export function ProjectsPage() {
  const projects = useProjects((s) => s.projects);
  const remove = useProjects((s) => s.deleteProject);

  return (
    <>
      <Typography.Title level={3}>Мои проекты</Typography.Title>
      {projects.length === 0 ? (
        <Empty description="Пока нет проектов">
          <Link to="/projects/new"><Button type="primary">Создать первый проект</Button></Link>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {projects.map((p) => (
            <Col key={p.id} xs={24} sm={12} lg={8}>
              <Card
                title={<Link to={`/projects/${p.id}`}>{p.name}</Link>}
                extra={
                  <Popconfirm title="Удалить проект?" okText="Удалить" cancelText="Отмена" onConfirm={() => remove(p.id)}>
                    <Button type="text" danger size="small">Удалить</Button>
                  </Popconfirm>
                }
              >
                <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                  {p.data.goal ? GOAL_LABELS[p.data.goal].title : '—'} · {new Date(p.createdAt).toLocaleDateString('ru-RU')}
                </Typography.Paragraph>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Полнота данных</Typography.Text>
                <Progress percent={completenessPercent(p.data)} size="small" />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  );
}
