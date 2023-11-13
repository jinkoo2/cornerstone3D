import type { Types } from '@cornerstonejs/core';
import ItkImageVolume from "./ItkImageVolume";

// Load the itk-wasm UMD module dynamically for the example.
// Normally, this will just go in the HTML <head>.
import vtkResourceLoader from '@kitware/vtk.js/IO/Core/ResourceLoader';
import { error } from 'console';

interface IVolumeLoader {
  promise: Promise<ItkImageVolume>;
  // cancel: () => void;
  // decache: () => void;
}


function fetchBinary(url: string):Promise<any> {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function (e) {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) {
          resolve(xhr.response);
        } else {
          reject({
            xhr: xhr,
            e: e
          });
        }
      }
    }; // Make request

    xhr.responseType = 'arraybuffer';
    xhr.send();
  }); // promise
}

function BitsAllocatedFromITKImage(itkImage:any): any{
  if(itkImage.imageType.componentType === 'int16')
    return 16;
  else if(itkImage.imageType.componentType === 'uint8')
    return 8;
  else
    throw new Error("Unknown itkImage ComponentType:"+itkImage.imageType.componentType);
}

function getImageVolumeFromItkImage(itkImage: any, volumeId: string): ItkImageVolume {
  
  // Compute Volume metadata based on imageIds
  const volumeMetadata: Types.Metadata = {
    BitsAllocated: BitsAllocatedFromITKImage(itkImage),
    BitsStored: BitsAllocatedFromITKImage(itkImage),
    SamplesPerPixel: 1,
    HighBit: BitsAllocatedFromITKImage(itkImage)-1,
    PhotometricInterpretation: 'MONOCHROME2',
    PixelRepresentation: 1,
    Modality: "CT",
    SeriesInstanceUID: "series.instance.UID",
    ImageOrientationPatient: [1.0, 0.0, 0.0],
    PixelSpacing: itkImage.spacing,
    FrameOfReferenceUID: "frameOfReference",
    Columns: itkImage.size[0],
    Rows: itkImage.size[1],
    voiLut: [{ windowWidth: 400, windowCenter: 40 }],
    VOILUTFunction: undefined,
  };

  const W: number = itkImage.size[0]  
  const H: number = itkImage.size[1]  
  const D: number = itkImage.size[2]  

  const imageVolumeProperties: Types.IVolume = {
    volumeId,
    metadata: volumeMetadata,
    dimensions: itkImage.size,
    spacing: itkImage.spacing,
    origin: itkImage.origin,
    direction: itkImage.direction,
    scalarData: itkImage.data,// new Int16Array(generateRandomFloatArray(W * H * D, -1000, 1000)), // pixel data
    sizeInBytes: W * H * D * 2,
  }

  const myImageVolume = new ItkImageVolume(imageVolumeProperties);

  return myImageVolume
}

function _image_url_from_volumeId(volumeId:string): string{
  return volumeId.slice(volumeId.indexOf(':')+1)
}

export default function myImageVolumeLoader(
  volumeId: string,
  options: {}
): IVolumeLoader {

  let p = new Promise<ItkImageVolume>((resolve, reject) => {

    // get image_url
    const image_url = _image_url_from_volumeId(volumeId)
   
    // load itk wasm to windows.itk
    vtkResourceLoader
      .loadScript(
        'https://cdn.jsdelivr.net/npm/itk-wasm@1.0.0-b.8/dist/umd/itk-wasm.js'
      )
      .then(() => {
        fetchBinary(image_url)
          .then((volumeArrayBuffer: ArrayBuffer):void => {
            
            // volumeArrayBuffer is the image in momory
            // reading as an itkImage from the memory
            window.itk.readImageArrayBuffer(
              null,
              volumeArrayBuffer,
              'random.image.name.mha'
            )
              .then((ret) => {
                const { image, webWorker } = ret

                const myImageVolume = getImageVolumeFromItkImage(image, volumeId)

                webWorker.terminate();

                resolve(myImageVolume)
              })
              .catch(error=>{
                reject(error)
              })
          })
      })



  })

  return {
    promise: p,
    // cancel: () => {
    //   //streamingImageVolume.cancelLoading();
    //   console.log('cancelLoading here')
    // },
    // decache: () => {
    //   //streamingImageVolume.cancelLoading();
    //   console.log('decache code here')
    // },
  };
}
