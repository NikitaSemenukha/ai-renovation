import { useRef, useState } from 'react';
import { BulbOutlined, PrinterOutlined } from '@ant-design/icons';
import { Alert, Button, Col, Flex, Row, Space, Switch, Table, Typography } from 'antd';
import type { Product, FurniturePlanSheet } from '@air/domain';
import { FurniturePlanDrawing } from './FurniturePlanDrawing';

interface Props {
  title: string;
  sheet: FurniturePlanSheet;
  products: Map<string, Product>;
  /** Спроектировать недостающие зоны подряд; undefined — кнопка недоступна. */
  onDesignMissing?: () => void;
  designing: boolean;
}

const money = (n: number) => n.toLocaleString('ru-RU');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface SpecRow {
  key: number;
  n: number;
  room: string;
  name: string;
  size: string;
  price?: number;
}

/** Лист «План размещения мебели» для всей квартиры: чертёж, экспликация, спецификация, печать. */
export function FurniturePlanView({ title, sheet, products, onDesignMissing, designing }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState(true);
  const [numbers, setNumbers] = useState(true);

  const spec: SpecRow[] = sheet.items
    .filter((p) => p.item.kind !== 'rug')
    .map((p) => {
      const prod = p.item.productId ? products.get(p.item.productId) : undefined;
      return {
        key: p.n,
        n: p.n,
        room: p.zoneName,
        name: prod?.name ?? p.item.label,
        size: `${Math.round(p.item.widthMm)}×${Math.round(p.item.depthMm)}×${Math.round(p.item.heightMm)}`,
        price: prod?.priceUah,
      };
    });
  const totalArea = sheet.rooms.reduce((s, r) => s + r.areaM2, 0);
  const designable = sheet.missing.filter((m) => !sheet.zones.find((z) => z.id === m.id)?.blockedReason);

  const print = () => {
    const svg = svgRef.current?.outerHTML;
    if (!svg) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const rooms = sheet.rooms
      .map((r, i) => `<tr><td>${String(i + 1).padStart(2, '0')}</td><td>${esc(r.name)}</td><td class="r">${r.areaM2.toFixed(2).replace('.', ',')}</td></tr>`)
      .join('');
    const items = spec
      .map((s) => `<tr><td>${s.n}</td><td>${esc(s.room)}</td><td>${esc(s.name)}</td><td class="r">${s.size}</td></tr>`)
      .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page { size: A3 landscape; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #333; margin: 0; }
      .sheet { display: grid; grid-template-columns: 1fr 330px; gap: 16px; }
      h1 { font-size: 18px; font-weight: normal; border-bottom: 1px solid #333; margin: 0 0 8px; }
      h2 { font-size: 14px; font-weight: normal; margin: 0 0 6px; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 14px; }
      td, th { border: 1px solid #555; padding: 3px 5px; } th { font-weight: normal; background: #eee; }
      .r { text-align: right; white-space: nowrap; } svg { width: 100%; height: auto; max-height: 250mm; }
      .note { font-size: 10px; color: #666; }
    </style></head><body>
      <h1>${esc(title)}</h1>
      <div class="sheet"><div>${svg}</div><div>
        <h2>Экспликация помещений</h2>
        <table><tr><th>№</th><th>Помещение</th><th>Площадь, м²</th></tr>${rooms}
        <tr><td></td><td>Итого</td><td class="r">${totalArea.toFixed(2).replace('.', ',')}</td></tr></table>
        <h2>Спецификация мебели</h2>
        <table><tr><th>№</th><th>Помещение</th><th>Наименование</th><th>Ш×Г×В, мм</th></tr>${items}</table>
        <p class="note">Размеры в мм. Привязки — от чистовой стены. Площади в чистоте ориентировочные, уточнить по обмерному плану. Подготовлено ИИ, требует проверки дизайнером.</p>
      </div></div>
      <script>window.onload = () => window.print();</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {sheet.missing.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={`Ещё не спроектировано: ${sheet.missing.map((m) => m.name).join(', ')}`}
          description={
            designable.length > 0
              ? `ИИ спроектирует комнаты по очереди — около ${Math.max(1, Math.round(designable.length * 1.2))} мин. Каждая комната — платный запрос.`
              : 'Эти зоны нельзя спроектировать — причина указана на их вкладках.'
          }
          action={
            designable.length > 0 && (
              <Button type="primary" icon={<BulbOutlined />} loading={designing} disabled={!onDesignMissing} onClick={onDesignMissing}>
                Спроектировать ({designable.length})
              </Button>
            )
          }
        />
      )}
      {sheet.stale.length > 0 && (
        <Alert type="warning" showIcon title={`Сделано по старой отделке или плану: ${sheet.stale.join(', ')}`}
          description="Откройте вкладку комнаты и нажмите «Ещё вариант», чтобы учесть изменения." />
      )}

      {sheet.items.length > 0 && (
        <>
          <Flex justify="space-between" align="center" wrap gap={8}>
            <Space size={16} wrap>
              <Space size={6}><Typography.Text style={{ fontSize: 12 }}>Размеры</Typography.Text><Switch size="small" checked={dims} onChange={setDims} /></Space>
              <Space size={6}><Typography.Text style={{ fontSize: 12 }}>Номера</Typography.Text><Switch size="small" checked={numbers} onChange={setNumbers} /></Space>
            </Space>
            <Button size="small" icon={<PrinterOutlined />} onClick={print}>Печать / PDF</Button>
          </Flex>
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
            <FurniturePlanDrawing ref={svgRef} sheet={sheet} showDimensions={dims} showNumbers={numbers} />
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Синие размеры — привязки предметов к чистовым стенам и их габариты, мм. Номера — позиции спецификации. План — основа для 3D, розеток, света и сантехники.
          </Typography.Text>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={9}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>Экспликация помещений</Typography.Title>
              <Table
                size="small"
                pagination={false}
                rowKey="id"
                dataSource={sheet.rooms.map((r, i) => ({ ...r, n: String(i + 1).padStart(2, '0') }))}
                columns={[
                  { title: '№', dataIndex: 'n', width: 48 },
                  { title: 'Помещение', dataIndex: 'name' },
                  { title: 'Площадь, м²', dataIndex: 'areaM2', align: 'right', render: (v: number) => v.toFixed(2).replace('.', ',') },
                ]}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} />
                    <Table.Summary.Cell index={1}>Итого</Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">{totalArea.toFixed(2).replace('.', ',')}</Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </Col>
            <Col xs={24} lg={15}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>Спецификация мебели</Typography.Title>
              <Table
                size="small"
                pagination={false}
                dataSource={spec}
                scroll={{ x: true }}
                columns={[
                  { title: '№', dataIndex: 'n', width: 48 },
                  { title: 'Помещение', dataIndex: 'room' },
                  { title: 'Наименование', dataIndex: 'name' },
                  { title: 'Ш×Г×В, мм', dataIndex: 'size', align: 'right' },
                  ...(spec.some((s) => s.price !== undefined)
                    ? [{ title: 'Цена, ₴', dataIndex: 'price', align: 'right' as const, render: (v?: number) => (v === undefined ? '—' : money(v)) }]
                    : []),
                ]}
              />
            </Col>
          </Row>
        </>
      )}
    </Space>
  );
}
