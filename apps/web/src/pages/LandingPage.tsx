import { Alert, Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router';

const FEATURES = [
  { title: 'Загрузите план', text: 'Техпаспорт, план застройщика или фото. Нет плана — подскажем, как замерить.', ready: true },
  { title: 'Отметьте ограничения', text: 'Несущие стены, стояки и газ. Сервис сразу предупредит о конфликтах с вашими пожеланиями.', ready: true },
  { title: 'Получите варианты', text: 'Несколько планировок с плюсами, рисками и ориентировочной стоимостью.', ready: false },
];

export function LandingPage() {
  return (
    <Space orientation="vertical" size={40} style={{ width: '100%', paddingTop: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
        <Typography.Title>Как будет выглядеть ваша квартира после ремонта</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 18 }}>
          Расскажите о квартире и о том, кто будет в ней жить. Мы учтём несущие стены и коммуникации
          и подберём варианты перепланировки. Анкета занимает около 5–7 минут.
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          style={{ textAlign: 'left', marginBottom: 20 }}
          title="Это прототип"
          description="Сейчас можно пройти анкету и сохранить проект. Распознавание плана и генерация вариантов — в разработке."
        />
        <Link to="/projects/new">
          <Button type="primary" size="large">Пройти анкету</Button>
        </Link>
      </div>
      <Row gutter={[16, 16]}>
        {FEATURES.map((f, i) => (
          <Col key={f.title} xs={24} md={8}>
            <Card style={{ height: '100%' }}>
              <Typography.Text type="secondary">Шаг {i + 1}</Typography.Text>{' '}
              {!f.ready && <Tag>в разработке</Tag>}
              <Typography.Title level={4} style={{ marginTop: 4 }}>{f.title}</Typography.Title>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{f.text}</Typography.Paragraph>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
