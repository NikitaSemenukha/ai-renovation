import { FolderOutlined, HomeOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Grid, Layout, Typography } from 'antd';
import { Link, NavLink, Outlet } from 'react-router';

export function AppLayout() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 12 : 24,
          padding: isMobile ? '0 12px' : '0 24px',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
          <HomeOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
            AI Renovation
          </Typography.Text>
        </Link>
        <nav style={{ flex: 1, minWidth: 0 }}>
          <NavLink to="/projects" style={{ whiteSpace: 'nowrap' }} aria-label="Мои проекты">
            {isMobile ? <FolderOutlined style={{ fontSize: 18 }} /> : 'Мои проекты'}
          </NavLink>
        </nav>
        <Link to="/projects/new">
          <Button type="primary" icon={<PlusOutlined />} aria-label="Новый проект">
            {isMobile ? null : 'Новый проект'}
          </Button>
        </Link>
      </Layout.Header>
      <Layout.Content style={{ padding: isMobile ? 12 : 24, maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </Layout.Content>
      <Layout.Footer style={{ textAlign: 'center', color: '#8c8c8c', fontSize: 12 }}>
        Прототип. Результаты — предварительные варианты, а не строительная документация.
      </Layout.Footer>
    </Layout>
  );
}
