
export type KeeperId = string;

export type EventType = 'video' | 'pause' | 'resume'
export interface EventData {
    type:EventType
}
export interface VideoTypeData extends EventData {
    autoStart?: boolean
    seek?: number
}
export interface Pause extends EventData {
    targetId: KeeperId
}
export interface Resume extends EventData {
    targetId: KeeperId
}

export interface Timing {
    keeperId: KeeperId
    start: number
    length?: number
    isTimer?: boolean
    functions?: {
        preStart?: Function
        postStart?: Function
        preEnd?: Function
        postEnd?: Function
    }
}

export interface Event {
    title?: string,
    data: EventType,
    id?: KeeperId,
    timing: Timing,
    typeData: EventData,
}
