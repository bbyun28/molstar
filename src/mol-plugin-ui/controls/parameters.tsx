/**
 * Copyright (c) 2018-2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Vec2, Vec3 } from '../../mol-math/linear-algebra';
import { Color } from '../../mol-util/color';
import { ColorListName, getColorListFromName } from '../../mol-util/color/lists';
import { memoize1 } from '../../mol-util/memoize';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { camelCaseToWords } from '../../mol-util/string';
import * as React from 'react';
import LineGraphComponent from './line-graph/line-graph-component';
import { Slider, Slider2 } from './slider';
import { NumericInput, IconButton, ControlGroup } from './common';
import { _Props, _State } from '../base';
import { legendFor } from './legend';
import { Legend as LegendData } from '../../mol-util/legend';
import { CombinedColorControl, ColorValueOption, ColorOptions } from './color';

export interface ParameterControlsProps<P extends PD.Params = PD.Params> {
    params: P,
    values: any,
    onChange: ParamOnChange,
    isDisabled?: boolean,
    onEnter?: () => void
}

export class ParameterControls<P extends PD.Params> extends React.PureComponent<ParameterControlsProps<P>, {}> {
    render() {
        const params = this.props.params;
        const values = this.props.values;
        const keys = Object.keys(params);
        if (keys.length === 0 || values === undefined) return null;
        return <>
            {keys.map(key => {
                const param = params[key];
                if (param.isHidden) return null;
                const Control = controlFor(param);
                if (!Control) return null;
                return <Control param={param} key={key} onChange={this.props.onChange} onEnter={this.props.onEnter} isDisabled={this.props.isDisabled} name={key} value={values[key]} />
            })}
        </>;
    }
}

function controlFor(param: PD.Any): ParamControl | undefined {
    switch (param.type) {
        case 'value': return void 0;
        case 'boolean': return BoolControl;
        case 'number': return typeof param.min !== 'undefined' && typeof param.max !== 'undefined'
            ? NumberRangeControl : NumberInputControl;
        case 'converted': return ConvertedControl;
        case 'conditioned': return ConditionedControl;
        case 'multi-select': return MultiSelectControl;
        case 'color': return CombinedColorControl;
        case 'color-list': return ColorListControl;
        case 'vec3': return Vec3Control;
        case 'file': return FileControl;
        case 'select': return SelectControl;
        case 'text': return TextControl;
        case 'interval': return typeof param.min !== 'undefined' && typeof param.max !== 'undefined'
            ? BoundedIntervalControl : IntervalControl;
        case 'group': return GroupControl;
        case 'mapped': return MappedControl;
        case 'line-graph': return LineGraphControl;
        case 'script': return ScriptControl;
        case 'object-list': return ObjectListControl;
        default:
            const _: never = param;
            console.warn(`${_} has no associated UI component`);
            return void 0;
    }
}

export class ParamHelp<L extends LegendData> extends React.PureComponent<{ legend?: L, description?: string }> {
    render() {
        const { legend, description } = this.props
        const Legend = legend && legendFor(legend)

        return <div className='msp-control-row msp-help-text'>
            <div>
                <div className='msp-help-description'><span className={`msp-icon msp-icon-help-circle`} />{description}</div>
                {Legend && <div className='msp-help-legend'><Legend legend={legend} /></div>}
            </div>
        </div>
    }
}

export type ParamOnChange = (params: { param: PD.Base<any>, name: string, value: any }) => void
export interface ParamProps<P extends PD.Base<any> = PD.Base<any>> {
    name: string,
    value: P['defaultValue'],
    param: P,
    isDisabled?: boolean,
    onChange: ParamOnChange,
    onEnter?: () => void
}
export type ParamControl = React.ComponentClass<ParamProps<any>>

export abstract class SimpleParam<P extends PD.Any> extends React.PureComponent<ParamProps<P>, { isExpanded: boolean }> {
    state = { isExpanded: false };

    protected update(value: P['defaultValue']) {
        this.props.onChange({ param: this.props.param, name: this.props.name, value });
    }

    abstract renderControl(): JSX.Element;

    private get className() {
        const className = ['msp-control-row'];
        if (this.props.param.shortLabel) className.push('msp-control-label-short')
        if (this.props.param.twoColumns) className.push('msp-control-col-2')
        return className.join(' ')
    }

    toggleExpanded = () => this.setState({ isExpanded: !this.state.isExpanded });

    render() {
        const label = this.props.param.label || camelCaseToWords(this.props.name);
        const help = this.props.param.help
            ? this.props.param.help(this.props.value)
            : { description: this.props.param.description, legend: this.props.param.legend }
        const desc = this.props.param.description;
        const hasHelp = help.description || help.legend
        return <>
            <div className={this.className}>
                <span title={desc}>
                    {label}
                    {hasHelp &&
                        <button className='msp-help msp-btn-link msp-btn-icon msp-control-group-expander' onClick={this.toggleExpanded}
                            title={desc || `${this.state.isExpanded ? 'Hide' : 'Show'} help`}
                            style={{ background: 'transparent', textAlign: 'left', padding: '0' }}>
                            <span className={`msp-icon msp-icon-help-circle-${this.state.isExpanded ? 'collapse' : 'expand'}`} />
                        </button>
                    }
                </span>
                <div>
                    {this.renderControl()}
                </div>
            </div>
            {hasHelp && this.state.isExpanded && <div className='msp-control-offset'>
                <ParamHelp legend={help.legend} description={help.description} />
            </div>}
        </>;
    }
}

export class BoolControl extends SimpleParam<PD.BooleanParam> {
    onClick = (e: React.MouseEvent<HTMLButtonElement>) => { this.update(!this.props.value); e.currentTarget.blur(); }
    renderControl() {
        return <button onClick={this.onClick} disabled={this.props.isDisabled}>
            <span className={`msp-icon msp-icon-${this.props.value ? 'ok' : 'off'}`} />
            {this.props.value ? 'On' : 'Off'}
        </button>;
    }
}

export class LineGraphControl extends React.PureComponent<ParamProps<PD.LineGraph>, { isExpanded: boolean, isOverPoint: boolean, message: string }> {
    state = {
        isExpanded: false,
        isOverPoint: false,
        message: `${this.props.param.defaultValue.length} points`,
    }

    onHover = (point?: Vec2) => {
        this.setState({ isOverPoint: !this.state.isOverPoint });
        if (point) {
            this.setState({ message: `(${point[0].toFixed(2)}, ${point[1].toFixed(2)})` });
            return;
        }
        this.setState({ message: `${this.props.value.length} points` });
    }

    onDrag = (point: Vec2) => {
        this.setState({ message: `(${point[0].toFixed(2)}, ${point[1].toFixed(2)})` });
    }

    onChange = (value: PD.LineGraph['defaultValue']) => {
        this.props.onChange({ name: this.props.name, param: this.props.param, value: value });
    }

    toggleExpanded = (e: React.MouseEvent<HTMLButtonElement>) => {
        this.setState({ isExpanded: !this.state.isExpanded });
        e.currentTarget.blur();
    }

    render() {
        const label = this.props.param.label || camelCaseToWords(this.props.name);
        return <>
            <div className='msp-control-row'>
                <span>{label}</span>
                <div>
                    <button onClick={this.toggleExpanded}>
                        {`${this.state.message}`}
                    </button>
                </div>
            </div>
            <div className='msp-control-offset' style={{ display: this.state.isExpanded ? 'block' : 'none' }}>
                <LineGraphComponent
                    data={this.props.param.defaultValue}
                    onChange={this.onChange}
                    onHover={this.onHover}
                    onDrag={this.onDrag} />
            </div>
        </>;
    }
}

export class NumberInputControl extends React.PureComponent<ParamProps<PD.Numeric>> {
    state = { value: '0' };

    update = (value: number) => {
        this.props.onChange({ param: this.props.param, name: this.props.name, value });
    }

    render() {
        const placeholder = this.props.param.label || camelCaseToWords(this.props.name);
        const label = this.props.param.label || camelCaseToWords(this.props.name);
        return <div className='msp-control-row'>
            <span title={this.props.param.description}>{label}</span>
            <div>
                <NumericInput
                    value={this.props.value} onEnter={this.props.onEnter} placeholder={placeholder}
                    isDisabled={this.props.isDisabled} onChange={this.update} />
            </div>
        </div>;
    }
}

export class NumberRangeControl extends SimpleParam<PD.Numeric> {
    onChange = (v: number) => { this.update(v); }
    renderControl() {
        const value = typeof this.props.value === 'undefined' ? this.props.param.defaultValue : this.props.value;
        return <Slider value={value} min={this.props.param.min!} max={this.props.param.max!}
            step={this.props.param.step} onChange={this.onChange} disabled={this.props.isDisabled} onEnter={this.props.onEnter} />
    }
}

export class TextControl extends SimpleParam<PD.Text> {
    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value !== this.props.value) {
            this.update(value);
        }
    }

    onKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.keyCode === 13 || e.charCode === 13)) {
            if (this.props.onEnter) this.props.onEnter();
        }
        e.stopPropagation();
    }

    renderControl() {
        const placeholder = this.props.param.label || camelCaseToWords(this.props.name);
        return <input type='text'
            value={this.props.value || ''}
            placeholder={placeholder}
            onChange={this.onChange}
            onKeyPress={this.props.onEnter ? this.onKeyPress : void 0}
            disabled={this.props.isDisabled}
        />;
    }
}

export class PureSelectControl extends  React.PureComponent<ParamProps<PD.Select<string | number>> & { title?: string }> {
    protected update(value: string | number) {
        this.props.onChange({ param: this.props.param, name: this.props.name, value });
    }

    onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (typeof this.props.param.defaultValue === 'number') {
            this.update(parseInt(e.target.value, 10));
        } else {
            this.update(e.target.value);
        }
    }

    render() {
        const isInvalid = this.props.value !== void 0 && !this.props.param.options.some(e => e[0] === this.props.value);
        return <select className='msp-form-control' title={this.props.title} value={this.props.value !== void 0 ? this.props.value : this.props.param.defaultValue} onChange={this.onChange} disabled={this.props.isDisabled}>
            {isInvalid && <option key={this.props.value} value={this.props.value}>{`[Invalid] ${this.props.value}`}</option>}
            {this.props.param.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>;
    }
}

export class SelectControl extends SimpleParam<PD.Select<string | number>> {
    onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (typeof this.props.param.defaultValue === 'number') {
            this.update(parseInt(e.target.value, 10));
        } else {
            this.update(e.target.value);
        }
    }
    renderControl() {
        const isInvalid = this.props.value !== void 0 && !this.props.param.options.some(e => e[0] === this.props.value);
        return <select value={this.props.value !== void 0 ? this.props.value : this.props.param.defaultValue} onChange={this.onChange} disabled={this.props.isDisabled}>
            {isInvalid && <option key={this.props.value} value={this.props.value}>{`[Invalid] ${this.props.value}`}</option>}
            {this.props.param.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>;
    }
}

export class IntervalControl extends SimpleParam<PD.Interval> {
    onChange = (v: [number, number]) => { this.update(v); }
    renderControl() {
        return <span>interval TODO</span>;
    }
}

export class BoundedIntervalControl extends SimpleParam<PD.Interval> {
    onChange = (v: [number, number]) => { this.update(v); }
    renderControl() {
        return <Slider2 value={this.props.value} min={this.props.param.min!} max={this.props.param.max!}
            step={this.props.param.step} onChange={this.onChange} disabled={this.props.isDisabled} onEnter={this.props.onEnter} />;
    }
}

export class ColorControl extends SimpleParam<PD.Color> {
    onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        this.update(Color(parseInt(e.target.value)));
    }

    stripStyle(): React.CSSProperties {
        return {
            background: Color.toStyle(this.props.value),
            position: 'absolute',
            bottom: '0',
            height: '4px',
            right: '0',
            left: '0'
        };
    }

    renderControl() {
        return <div style={{ position: 'relative' }}>
            <select value={this.props.value} onChange={this.onChange}>
                {ColorValueOption(this.props.value)}
                {ColorOptions()}
            </select>
            <div style={this.stripStyle()} />
        </div>;
    }
}

const colorGradientInterpolated = memoize1((colors: Color[]) => {
    const styles = colors.map(c => Color.toStyle(c))
    return `linear-gradient(to right, ${styles.join(', ')})`
});

const colorGradientBanded = memoize1((colors: Color[]) => {
    const n = colors.length
    const styles: string[] = [`${Color.toStyle(colors[0])} ${100 * (1 / n)}%`]
    for (let i = 1, il = n - 1; i < il; ++i) {
        styles.push(
            `${Color.toStyle(colors[i])} ${100 * (i / n)}%`,
            `${Color.toStyle(colors[i])} ${100 * ((i + 1) / n)}%`
        )
    }
    styles.push(`${Color.toStyle(colors[n - 1])} ${100 * ((n - 1) / n)}%`)
    return `linear-gradient(to right, ${styles.join(', ')})`
});

function colorGradient(name: ColorListName, banded: boolean) {
    const { list, type } = getColorListFromName(name)
    return type === 'qualitative' ? colorGradientBanded(list) : colorGradientInterpolated(list)
}

export class ColorListControl extends SimpleParam<PD.ColorList<any>> {
    onChange = (e: React.ChangeEvent<HTMLSelectElement>) => { this.update(e.target.value); }

    stripStyle(): React.CSSProperties {
        return {
            background: colorGradient(this.props.value, true),
            position: 'absolute',
            bottom: '0',
            height: '4px',
            right: '0',
            left: '0'
        };
    }

    renderControl() {
        return <div style={{ position: 'relative' }}>
            <select value={this.props.value || ''} onChange={this.onChange} disabled={this.props.isDisabled}>
                {this.props.param.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div style={this.stripStyle()} />
        </div>;
    }
}

export class Vec3Control extends React.PureComponent<ParamProps<PD.Vec3>, { isExpanded: boolean }> {
    state = { isExpanded: false }

    components = {
        0: PD.Numeric(0, void 0, { label: (this.props.param.fieldLabels && this.props.param.fieldLabels.x) || 'X' }),
        1: PD.Numeric(0, void 0, { label: (this.props.param.fieldLabels && this.props.param.fieldLabels.y) || 'Y' }),
        2: PD.Numeric(0, void 0, { label: (this.props.param.fieldLabels && this.props.param.fieldLabels.z) || 'Z' })
    }

    change(value: PD.MultiSelect<any>['defaultValue']) {
        this.props.onChange({ name: this.props.name, param: this.props.param, value });
    }

    componentChange: ParamOnChange = ({ name, value }) => {
        const v = Vec3.copy(Vec3.zero(), this.props.value);
        v[+name] = value;
        this.change(v);
    }

    toggleExpanded = (e: React.MouseEvent<HTMLButtonElement>) => {
        this.setState({ isExpanded: !this.state.isExpanded });
        e.currentTarget.blur();
    }

    render() {
        const v = this.props.value;
        const label = this.props.param.label || camelCaseToWords(this.props.name);
        const value = `[${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)}]`;
        return <>
            <div className='msp-control-row'>
                <span>{label}</span>
                <div>
                    <button onClick={this.toggleExpanded}>{value}</button>
                </div>
            </div>
            <div className='msp-control-offset' style={{ display: this.state.isExpanded ? 'block' : 'none' }}>
                <ParameterControls params={this.components} values={v} onChange={this.componentChange} onEnter={this.props.onEnter} />
            </div>
        </>;
    }
}


export class FileControl extends React.PureComponent<ParamProps<PD.FileParam>> {
    change(value: File) {
        this.props.onChange({ name: this.props.name, param: this.props.param, value });
    }

    onChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.change(e.target.files![0]);
    }

    render() {
        const value = this.props.value;

        // return <input disabled={this.props.isDisabled} value={void 0} type='file' multiple={false} />
        return <div className='msp-btn msp-btn-block msp-btn-action msp-loader-msp-btn-file' style={{ marginTop: '1px' }}>
            {value ? value.name : 'Select a file...'} <input disabled={this.props.isDisabled} onChange={this.onChangeFile} type='file' multiple={false} accept={this.props.param.accept} />
        </div>
    }
}

export class MultiSelectControl extends React.PureComponent<ParamProps<PD.MultiSelect<any>>, { isExpanded: boolean }> {
    state = { isExpanded: false }

    change(value: PD.MultiSelect<any>['defaultValue']) {
        this.props.onChange({ name: this.props.name, param: this.props.param, value });
    }

    toggle(key: string) {
        return (e: React.MouseEvent<HTMLButtonElement>) => {
            if (this.props.value.indexOf(key) < 0) this.change(this.props.value.concat(key));
            else this.change(this.props.value.filter(v => v !== key));
            e.currentTarget.blur();
        }
    }

    toggleExpanded = (e: React.MouseEvent<HTMLButtonElement>) => {
        this.setState({ isExpanded: !this.state.isExpanded });
        e.currentTarget.blur();
    }

    render() {
        const current = this.props.value;
        const label = this.props.param.label || camelCaseToWords(this.props.name);
        return <>
            <div className='msp-control-row'>
                <span>{label}</span>
                <div>
                    <button onClick={this.toggleExpanded}>
                        {`${current.length} of ${this.props.param.options.length}`}
                    </button>
                </div>
            </div>
            <div className='msp-control-offset' style={{ display: this.state.isExpanded ? 'block' : 'none' }}>
                {this.props.param.options.map(([value, label]) => {
                    const sel = current.indexOf(value) >= 0;
                    return <div key={value} className='msp-row'>
                        <button onClick={this.toggle(value)} disabled={this.props.isDisabled}>
                            <span style={{ float: sel ? 'left' : 'right' }}>{sel ? `✓ ${label}` : `${label} ✗`}</span>
                        </button>
                    </div>
                })}
            </div>
        </>;
    }
}

export class GroupControl extends React.PureComponent<ParamProps<PD.Group<any>>, { isExpanded: boolean }> {
    state = { isExpanded: !!this.props.param.isExpanded }

    change(value: any) {
        this.props.onChange({ name: this.props.name, param: this.props.param, value });
    }

    onChangeParam: ParamOnChange = e => {
        this.change({ ...this.props.value, [e.name]: e.value });
    }

    toggleExpanded = () => this.setState({ isExpanded: !this.state.isExpanded });

    render() {
        const params = this.props.param.params;

        // Do not show if there are no params.
        if (Object.keys(params).length === 0) return null;

        const label = this.props.param.label || camelCaseToWords(this.props.name);

        const controls = <ParameterControls params={params} onChange={this.onChangeParam} values={this.props.value} onEnter={this.props.onEnter} isDisabled={this.props.isDisabled} />;

        if (this.props.param.isFlat) {
            return controls;
        }

        return <div className='msp-control-group-wrapper'>
            <div className='msp-control-group-header'>
                <button className='msp-btn msp-btn-block' onClick={this.toggleExpanded}>
                    <span className={`msp-icon msp-icon-${this.state.isExpanded ? 'collapse' : 'expand'}`} />
                    {label}
                </button>
            </div>
            {this.state.isExpanded && <div className='msp-control-offset' style={{ display: this.state.isExpanded ? 'block' : 'none' }}>
                {controls}
            </div>}
        </div>
    }
}

export class MappedControl extends React.PureComponent<ParamProps<PD.Mapped<any>>> {
    private valuesCache: { [name: string]: PD.Values<any> } = {}
    private setValues(name: string, values: PD.Values<any>) {
        this.valuesCache[name] = values
    }
    private getValues(name: string) {
        if (name in this.valuesCache) {
            return this.valuesCache[name]
        } else {
            return this.props.param.map(name).defaultValue
        }
    }

    change(value: PD.Mapped<any>['defaultValue']) {
        this.props.onChange({ name: this.props.name, param: this.props.param, value });
    }

    onChangeName: ParamOnChange = e => {
        this.change({ name: e.value, params: this.getValues(e.value) });
    }

    onChangeParam: ParamOnChange = e => {
        this.setValues(this.props.value.name, e.value)
        this.change({ name: this.props.value.name, params: e.value });
    }

    render() {
        const value: PD.Mapped<any>['defaultValue'] = this.props.value;
        const param = this.props.param.map(value.name);
        const label = this.props.param.label || camelCaseToWords(this.props.name);
        const Mapped = controlFor(param);

        const help = this.props.param.help
        const select = help
            ? {
                ...this.props.param.select,
                help: (name: any) => help({ name, params: this.getValues(name) })
            }
            : this.props.param.select

        const Select = <SelectControl param={select}
            isDisabled={this.props.isDisabled} onChange={this.onChangeName} onEnter={this.props.onEnter}
            name={label} value={value.name} />

        if (!Mapped) {
            return Select;
        }

        return <>
            {Select}
            <Mapped param={param} value={value.params} name={`${label} Properties`} onChange={this.onChangeParam} onEnter={this.props.onEnter} isDisabled={this.props.isDisabled} />
        </>
    }
}

class ObjectListEditor extends React.PureComponent<{ params: PD.Params, value: object, isUpdate?: boolean, apply: (value: any) => void, isDisabled?: boolean }, { params: PD.Params, value: object, current: object }> {
    state = { params: {}, value: void 0 as any, current: void 0 as any };

    onChangeParam: ParamOnChange = e => {
        this.setState({ current: { ...this.state.current, [e.name]: e.value } });
    }

    apply = () => {
        this.props.apply(this.state.current);
    }

    static getDerivedStateFromProps(props: _Props<ObjectListEditor>, state: _State<ObjectListEditor>): _State<ObjectListEditor> | null {
        if (props.params === state.params && props.value === state.value) return null;
        return {
            params: props.params,
            value: props.value,
            current: props.value
        };
    }

    render() {
        return <>
            <ParameterControls params={this.props.params} onChange={this.onChangeParam} values={this.state.current} onEnter={this.apply} isDisabled={this.props.isDisabled} />
            <button className={`msp-btn msp-btn-block msp-form-control msp-control-top-offset`} onClick={this.apply} disabled={this.props.isDisabled}>
                {this.props.isUpdate ? 'Update' : 'Add'}
            </button>
        </>;
    }
}

class ObjectListItem extends React.PureComponent<{ param: PD.ObjectList, value: object, index: number, actions: ObjectListControl['actions'], isDisabled?: boolean }, { isExpanded: boolean }> {
    state = { isExpanded: false };

    update = (v: object) => {
        this.setState({ isExpanded: false });
        this.props.actions.update(v, this.props.index);
    }

    moveUp = () => {
        this.props.actions.move(this.props.index, -1);
    };

    moveDown = () => {
        this.props.actions.move(this.props.index, 1);
    };

    remove = () => {
        this.setState({ isExpanded: false });
        this.props.actions.remove(this.props.index);
    };

    toggleExpanded = (e: React.MouseEvent<HTMLButtonElement>) => {
        this.setState({ isExpanded: !this.state.isExpanded });
        e.currentTarget.blur();
    };

    static getDerivedStateFromProps(props: _Props<ObjectListEditor>, state: _State<ObjectListEditor>): _State<ObjectListEditor> | null {
        if (props.params === state.params && props.value === state.value) return null;
        return {
            params: props.params,
            value: props.value,
            current: props.value
        };
    }

    render() {
        return <>
            <div className='msp-param-object-list-item'>
                <button className='msp-btn msp-btn-block msp-form-control' onClick={this.toggleExpanded}>
                    <span>{`${this.props.index + 1}: `}</span>
                    {this.props.param.getLabel(this.props.value)}
                </button>
                <div>
                    <IconButton icon='up-thin' title='Move Up' onClick={this.moveUp} isSmall={true} />
                    <IconButton icon='down-thin' title='Move Down' onClick={this.moveDown} isSmall={true} />
                    <IconButton icon='remove' title='Remove' onClick={this.remove} isSmall={true} />
                </div>
            </div>
            {this.state.isExpanded && <div className='msp-control-offset'>
                <ObjectListEditor params={this.props.param.element} apply={this.update} value={this.props.value} isUpdate isDisabled={this.props.isDisabled} />
            </div>}
        </>;
    }
}

export class ObjectListControl extends React.PureComponent<ParamProps<PD.ObjectList>, { isExpanded: boolean }> {
    state = { isExpanded: false }

    change(value: any) {
        this.props.onChange({ name: this.props.name, param: this.props.param, value });
    }

    add = (v: object) => {
        this.change([...this.props.value, v]);
    };

    actions = {
        update: (v: object, i: number) => {
            const value = this.props.value.slice(0);
            value[i] = v;
            this.change(value);
        },
        move: (i: number, dir: -1 | 1) => {
            let xs = this.props.value;
            if (xs.length === 1) return;

            let j = (i + dir) % xs.length;
            if (j < 0) j += xs.length;

            xs = xs.slice(0);
            const t = xs[i];
            xs[i] = xs[j];
            xs[j] = t;
            this.change(xs);
        },
        remove: (i: number) => {
            const xs = this.props.value;
            const update: object[] = [];
            for (let j = 0; j < xs.length; j++) {
                if (i !== j) update.push(xs[j]);
            }
            this.change(update);
        }
    }

    toggleExpanded = (e: React.MouseEvent<HTMLButtonElement>) => {
        this.setState({ isExpanded: !this.state.isExpanded });
        e.currentTarget.blur();
    };

    render() {
        const v = this.props.value;
        const label = this.props.param.label || camelCaseToWords(this.props.name);
        const value = `${v.length} item${v.length !== 1 ? 's' : ''}`;
        return <>
            <div className='msp-control-row'>
                <span>{label}</span>
                <div>
                    <button onClick={this.toggleExpanded}>{value}</button>
                </div>
            </div>

            {this.state.isExpanded && <div className='msp-control-offset'>
                {this.props.value.map((v, i) => <ObjectListItem key={i} param={this.props.param} value={v} index={i} actions={this.actions} />)}
                <ControlGroup header='New Item'>
                    <ObjectListEditor params={this.props.param.element} apply={this.add} value={this.props.param.ctor()} isDisabled={this.props.isDisabled} />
                </ControlGroup>
            </div>}
        </>;
    }
}

export class ConditionedControl extends React.PureComponent<ParamProps<PD.Conditioned<any, any, any>>> {
    change(value: PD.Conditioned<any, any, any>['defaultValue']) {
        this.props.onChange({ name: this.props.name, param: this.props.param, value });
    }

    onChangeCondition: ParamOnChange = e => {
        this.change(this.props.param.conditionedValue(this.props.value, e.value));
    }

    onChangeParam: ParamOnChange = e => {
        this.change(e.value);
    }

    render() {
        const value = this.props.value;
        const condition = this.props.param.conditionForValue(value) as string
        const param = this.props.param.conditionParams[condition];
        const label = this.props.param.label || camelCaseToWords(this.props.name);
        const Conditioned = controlFor(param);

        const select = <SelectControl param={this.props.param.select}
            isDisabled={this.props.isDisabled} onChange={this.onChangeCondition} onEnter={this.props.onEnter}
            name={`${label} Kind`} value={condition} />

        if (!Conditioned) {
            return select;
        }

        return <>
            {select}
            <Conditioned param={param} value={value} name={label} onChange={this.onChangeParam} onEnter={this.props.onEnter} isDisabled={this.props.isDisabled} />
        </>
    }
}

export class ConvertedControl extends React.PureComponent<ParamProps<PD.Converted<any, any>>> {
    onChange: ParamOnChange = e => {
        this.props.onChange({
            name: this.props.name,
            param: this.props.param,
            value: this.props.param.toValue(e.value)
        });
    }

    render() {
        const value = this.props.param.fromValue(this.props.value);
        const Converted = controlFor(this.props.param.converted);

        if (!Converted) return null;
        return <Converted param={this.props.param.converted} value={value} name={this.props.name} onChange={this.onChange} onEnter={this.props.onEnter} isDisabled={this.props.isDisabled} />
    }
}

export class ScriptControl extends SimpleParam<PD.Script> {
    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value !== this.props.value.expression) {
            this.update({ language: this.props.value.language, expression: value });
        }
    }

    onKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.keyCode === 13 || e.charCode === 13)) {
            if (this.props.onEnter) this.props.onEnter();
        }
        e.stopPropagation();
    }

    renderControl() {
        // TODO: improve!

        const placeholder = this.props.param.label || camelCaseToWords(this.props.name);
        return <input type='text'
            value={this.props.value.expression || ''}
            placeholder={placeholder}
            onChange={this.onChange}
            onKeyPress={this.props.onEnter ? this.onKeyPress : void 0}
            disabled={this.props.isDisabled}
        />;
    }
}