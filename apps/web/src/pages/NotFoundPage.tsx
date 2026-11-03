import { Button, Result } from 'antd';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';

export function NotFoundPage() {
  return (
    <Result
      status="404"
      title="Страница не найдена"
      subTitle="Возможно, ссылка устарела или в адресе опечатка."
      extra={<Link to="/"><Button type="primary">На главную</Button></Link>}
    />
  );
}

/** Ошибка рендера или маршрута — вместо сырого экрана React Router. */
export function ErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  console.error('[route error]', error);
  return (
    <Result
      status="error"
      title="Что-то пошло не так"
      subTitle="Ваши данные сохранены в браузере. Попробуйте обновить страницу."
      extra={<Button type="primary" onClick={() => window.location.assign('/')}>На главную</Button>}
    />
  );
}
