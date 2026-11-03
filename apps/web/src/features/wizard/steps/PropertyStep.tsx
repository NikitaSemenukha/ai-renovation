import { Col, Input, InputNumber, Radio, Row, Select } from 'antd';
import {
  DEFAULT_CEILING_HEIGHT_MM,
  fieldErrors,
  type BuildingType,
  type ProjectStage,
  type PropertyType,
} from '@air/domain';
import { ChoiceCards } from '../../../components/ChoiceCards';
import { Field } from '../../../components/Field';
import { BUILDING_TYPE_LABELS, PROPERTY_TYPE_LABELS, STAGE_LABELS } from '../../../labels';
import { useDraft } from '../useDraft';

const BUILDING_TYPES = Object.keys(BUILDING_TYPE_LABELS) as BuildingType[];

export function PropertyStep() {
  const { draft, update } = useDraft();
  const p = draft.property;
  const errors = fieldErrors(draft);

  return (
    <>
      <Field id="property-type" label="Тип объекта" required>
        <Radio.Group
          optionType="button"
          aria-labelledby="property-type-label"
          value={p.propertyType}
          onChange={(e) => update((d) => void (d.property.propertyType = e.target.value as PropertyType))}
          options={(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((v) => ({
            value: v,
            label: PROPERTY_TYPE_LABELS[v],
          }))}
        />
      </Field>

      <Field id="building-type" label="Тип дома" required hint="главная подсказка, какие стены вероятно несущие (только предположение)">
        <ChoiceCards
          columns={4}
          labelledBy="building-type-label"
          value={p.buildingType}
          onChange={(v) => update((d) => void (d.property.buildingType = v))}
          options={BUILDING_TYPES.map((v) => ({ value: v, ...BUILDING_TYPE_LABELS[v] }))}
        />
      </Field>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Field id="country" label="Страна" required hint="нормы перепланировки и цены в смете">
            <Input id="country" value={p.country} placeholder="Например, Украина"
              onChange={(e) => update((d) => void (d.property.country = e.target.value))} />
          </Field>
        </Col>
        <Col xs={24} md={12}>
          <Field id="city" label="Город" required>
            <Input id="city" value={p.city} placeholder="Например, Киев"
              onChange={(e) => update((d) => void (d.property.city = e.target.value))} />
          </Field>
        </Col>
        <Col xs={24} md={12}>
          <Field id="series" label="Серия дома или год постройки" hint="можно подтянуть типовой план">
            <Input id="series" value={p.seriesOrYear} placeholder="Например, 1-464 или 2018"
              onChange={(e) => update((d) => void (d.property.seriesOrYear = e.target.value || undefined))} />
          </Field>
        </Col>
        <Col xs={12} md={6}>
          <Field id="floor" label="Этаж" hint="ограничения по мокрым зонам" error={errors['property.floor']}>
            <InputNumber id="floor" precision={0} value={p.floor} status={errors['property.floor'] ? 'error' : undefined}
              onChange={(v) => update((d) => void (d.property.floor = v ?? undefined))} style={{ width: '100%' }} />
          </Field>
        </Col>
        <Col xs={12} md={6}>
          <Field id="total-floors" label="Этажей в доме">
            <InputNumber id="total-floors" precision={0} min={1} value={p.totalFloors}
              onChange={(v) => update((d) => void (d.property.totalFloors = v ?? undefined))} style={{ width: '100%' }} />
          </Field>
        </Col>
        <Col xs={24} md={12}>
          <Field
            id="ceiling"
            label="Высота потолков, м"
            hint={`обычно 2.5–3.2 м; если не знаете — возьмём ${DEFAULT_CEILING_HEIGHT_MM / 1000} м с пометкой «примерно»`}
            error={errors['property.ceilingHeightMm']}
          >
            {/* Без min/max: значение не обрезается молча, а проверяется с понятной ошибкой */}
            <InputNumber
              id="ceiling"
              step={0.05}
              status={errors['property.ceilingHeightMm'] ? 'error' : undefined}
              value={p.ceilingHeightMm !== undefined ? p.ceilingHeightMm / 1000 : undefined}
              onChange={(v) => update((d) => void (d.property.ceilingHeightMm = v != null ? Math.round(v * 1000) : undefined))}
              placeholder={`${DEFAULT_CEILING_HEIGHT_MM / 1000} (примерно)`}
              style={{ width: '100%' }}
            />
          </Field>
        </Col>
        <Col xs={24} md={12}>
          <Field id="stage" label="Стадия">
            <Select<ProjectStage>
              id="stage"
              allowClear
              value={p.stage}
              onChange={(v) => update((d) => void (d.property.stage = v))}
              options={(Object.keys(STAGE_LABELS) as ProjectStage[]).map((v) => ({ value: v, label: STAGE_LABELS[v] }))}
              placeholder="Выберите"
              style={{ width: '100%' }}
            />
          </Field>
        </Col>
      </Row>
    </>
  );
}
