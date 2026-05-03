interface Bluetooth {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface RequestDeviceOptions {
  filters?: Array<{ services?: BluetoothServiceUUID[]; name?: string; namePrefix?: string }>;
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;

interface BluetoothDevice {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(
    characteristic: BluetoothCharacteristicUUID
  ): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristicEventTarget extends EventTarget {
  value?: DataView;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  addEventListener(
    type: "characteristicvaluechanged",
    listener: (this: BluetoothRemoteGATTCharacteristic, ev: Event & { target: BluetoothRemoteGATTCharacteristicEventTarget }) => void
  ): void;
}
