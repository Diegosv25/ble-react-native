import { deserialize } from "bson";
import pkg from 'js-crc';
const {crc32} = pkg;
import { Buffer } from 'buffer';

const auxBuffer = Buffer.from('000102030405', 'hex');
var flagACK;

export const MountFormat = (bsonParameters, isACK, isMultiPackage) => {
    flagACK = isACK;
    var databytes = new Array(bsonParameters.length + 10);

    // LENGTH
    var length = bsonParameters.length + 6; // 6 => (2 bytes [data type, packages] + 4 bytes [checksum])
    if (length <= 255) {
        databytes[0] = length;
        databytes[1] = 0;
    } else {
        var res = length.toString(16);
        var bLength = Buffer.from(res.length % 2 !== 0 ? '0' + res : res, 'hex');
        databytes[0] = bLength[0];
        databytes[1] = bLength[1];
    }

    // HEADER
    databytes[2] = auxBuffer[0];
    databytes[3] = 0x11;

    // DATA
    databytes[4] = flagACK ? auxBuffer[3] : auxBuffer[2]; // Package type: 01 -> error, 02 -> data, 03 -> ACK
    if (!flagACK) {
        databytes[5] = !isMultiPackage ? auxBuffer[0] : auxBuffer[1]; // RFU: 0 -> single package, 1 -> multipackage
    }
    else {
        databytes[5] = auxBuffer[1]; // ACK: 0 -> NAK, 1 -> ACK
    }
    if (bsonParameters.length > 0) {
        for (var j = 0; j < bsonParameters.length; j++) {
            databytes[6 + j] = bsonParameters[j];
        }
    }

    // CHECKSUM
    var checksum = ReserveOrder(GetChecksum(bsonParameters, isMultiPackage));

    databytes[databytes.length - 4] = (parseInt(checksum[0], '16'));
    databytes[databytes.length - 3] = (parseInt(checksum[1], '16'));
    databytes[databytes.length - 2] = (parseInt(checksum[2], '16'));
    databytes[databytes.length - 1] = (parseInt(checksum[3], '16'));

    return databytes;
}

const CalculateCRC32 = (str) => {
    return crc32(str);
}

const ReserveOrder = (checksum) => {
    var aux = new Array(4), aux2 = new Array(4);
    var aux3 = '';
    var i = 0, j = 0;

    checksum.split('').forEach(element => {
        aux3 += element.toString();
        i++;
        if (i === 2) {
            aux[j] = aux3;
            j++; i = 0; aux3 = '';
        }
    });
    for (let i = 0; i < aux2.length; i++) {
        aux2[i] = aux[3 - i];
    }
    return aux2;
}

const GetChecksum = (data, isMultiPackage) => {
    var dataAux = new Array(data.length + 2);
    dataAux[0] = flagACK ? auxBuffer[3] : auxBuffer[2];

    if (!flagACK) {
        dataAux[1] = !isMultiPackage ? auxBuffer[0] : auxBuffer[1];
    } else {
        dataAux[1] = auxBuffer[1];
    }

    if (data.length > 0) {
        for (let i = 0; i < data.length; i++) {
            dataAux[i + 2] = data[i];
        }
    }
    return CalculateCRC32(dataAux).toString();
}

export const SplitData = (data) => {
    var dataDes = deserialize(data);
    if(data.length === 22){
      return JSON.stringify(dataDes);
    }else{
      const initObj = {};
      var obj = Object.create(initObj);
      obj.action = 10;
      if(dataDes["sData"] !== undefined)
      {
        var res = data.slice(33, data.length-1);
        obj.ok = 'true';
        obj.sData = Buffer.from(res, 'hex').toString('hex'); //setDataResCode(Buffer.from(res))
      }
      else if(dataDes["runerr"] !== undefined)
      {
        obj.ok = 'false';
        obj.runerr = dataDes["runerr"].toString(16);
      }
      return JSON.stringify(obj);
    }
  }

  export const checkCRC32 = (finalData) => {
    const crc = finalData.slice(finalData.length-4, finalData.length);
    const finalDataCRC32 = Array.from(Buffer.from(CalculateCRC32(finalData.slice(4, finalData.length-4)), 'hex'));
    return crc.toString(16) === finalDataCRC32.reverse().toString(16);
  }