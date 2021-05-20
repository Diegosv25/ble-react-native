import React, { useState, useEffect } from 'react'
import { Platform, View, Text } from 'react-native'
import { BleManager, ScanMode } from 'react-native-ble-plx';
import base64 from 'react-native-base64';
import { Buffer } from 'buffer';
import pkg from 'js-crc';
const { crc32 } = pkg;
const auxBuffer = Buffer.from('000102030405', 'hex');
var flagACK;

const manager = new BleManager();

const Ble = () => {
  //hashdevice
  const _deviceID = 'HW29C9E006';
  // Service AE353366-EAAA-4E29-98CC-AECB33A323ED
  const uuidService = "00002760-08C2-11E1-9073-0E8AC72E1011";
  //Read notification Characteristic
  const uuidReadNotification = "00002760-08C2-11E1-9073-0E8AC72E0013";
  // Read Characteristic.
  const uuidRead = "00002760-08C2-11E1-9073-0E8AC72E0012";
  // Write Characteristic.
  const uuidWrite = "00002760-08C2-11E1-9073-0E8AC72E0011";

  var data = [], auxData = [], multiPkgData = [], blk = [], u32 = [], u64 = [], res = '', index;
  var errorDataReceived = false, isACK, isData, isMultiPackage, isConnected = false;
  var bson = '4F00001102004900000010616374696F6E000A000000086E6F63686B00010372756E002B0000000568647200040000000000000000056F700004000000004D514D8005736967000100000000AA000066AF488E';

  useEffect(() => {
    const subscription = manager.onStateChange((s) => {
      if (s === 'PoweredOn') {
        scanAndConnect();
        subscription.remove();
      }
    }, true);

    return () => {
      subscription.remove();
    }

  }, [])

  const scanAndConnect = async () => {
    manager.startDeviceScan(null, { allowDuplicates: false, scanMode: ScanMode.LowLatency }, (error, d) => {
      if (error) { console.log('ERROR --> ' + error.message); return; }
      if (d.name === _deviceID) {
        console.log("Connecting to " + d.name)
        manager.stopDeviceScan();
        connect(d)
      }
    });
  }

  const connect = async d => {
    if (d) {
      try {
        const conexion = await d.connect();
        const servicesAndCharacteristics = await conexion.discoverAllServicesAndCharacteristics();
        const services = await servicesAndCharacteristics.services();
        const CUSTOM_SERVICE = services.find(s => s.uuid.toUpperCase() === uuidService);
        const characteristics = await CUSTOM_SERVICE.characteristics();
        const cWrite = characteristics.find(c => c.uuid.toUpperCase() === uuidWrite);
        const cReadNotification = characteristics.find(c => c.uuid.toUpperCase() === uuidReadNotification);
        const cRead = characteristics.find(c => c.uuid.toUpperCase() === uuidRead);

        if (cWrite && cRead) {
          //const b64 = base64.encodeFromByteArray(toByteArray('060000110002D373D7AF'));
          //const b64 = base64.encodeFromByteArray(MountFormat(toByteArray(bson.slice(0, 80)), false, true));
          const b64 = base64.encodeFromByteArray(Buffer.from(bson, 'hex'));
          index = 80;
          console.log('Start listening READ characteristic ...');
          const write = await cWrite.writeWithoutResponse(b64);
          cRead.monitor(onCharacteristicValueChange);
        }
      } catch (error) {
        console.log('ERROR --> ' + error.message)
      }
    }
  }

  const onCharacteristicValueChange = (error, characteristic) => {
    if (error) { console.log('Characteristic error: ', JSON.stringify(error)); return; }
    if(characteristic) {
      const data = base64.decode(characteristic.value);
      console.log('DATA: ', data);
      return;
    }
  }
  
  return (
    <View>
      <Text>DISPOSITIVOS</Text>
    </View>
  )
}

export default Ble
