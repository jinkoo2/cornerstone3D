import { ImageVolume } from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core';


export default class ItkImageVolume extends ImageVolume {
    
    // member variables
    protected numFrames: number;
    protected cornerstoneImageMetaData: any = null;
    
    // constructor
    public constructor(imageVolumeProperties: Types.IVolume) 
    {
      super(imageVolumeProperties);

      console.log('imageVolumeProperties=', imageVolumeProperties)

      this.numFrames = imageVolumeProperties.dimensions[2]

      this._createCornerstoneImageMetaData()
    }


//    /**
//    * * @returns This is not a dynamic image, so it returns number of slices for 3D volume.
//    */
//   private _getNumFrames(): number {
//     return this.numFrames;
//   }

//   private _getScalarDataLength(): number {
//     const { scalarData } = this;
//     return (<Types.VolumeScalarData>scalarData).length;
//   }

  /**
   * Creates the metadata required for converting the volume to an cornerstoneImage
   */
  private _createCornerstoneImageMetaData() {
    const { numFrames } = this;

    if (numFrames === 0) {
      return;
    }

    const bytesPerImage = this.sizeInBytes / numFrames;
    const numComponents = 1;
    const pixelsPerImage = this.dimensions[0] * this.dimensions[1];

    const { PhotometricInterpretation, voiLut, VOILUTFunction } = this.metadata;

    let windowCenter:any[] = [];
    let windowWidth:any[] = [];

    if (voiLut && voiLut.length) {
        windowCenter = voiLut.map((voi) => {
        return voi.windowCenter;
      });

      windowWidth = voiLut.map((voi) => {
        return voi.windowWidth;
      });
    }

    this.cornerstoneImageMetaData = {
      bytesPerImage,
      numComponents,
      pixelsPerImage,
      windowCenter,
      windowWidth,
      color:false,
      rgba: false,
      spacing: this.spacing,
      dimensions: this.dimensions,
      PhotometricInterpretation,
      voiLUTFunction: VOILUTFunction,
      invert: PhotometricInterpretation === 'MONOCHROME1',
    };

    console.log('this.cornerstoneImageMetaData=', this.cornerstoneImageMetaData)
  }

//     /**
//    * Return all scalar data objects (buffers) which will be only one for
//    * 3D volumes and one per time point for 4D volumes
//    * images of each 3D volume is stored
//    * @returns scalar data array
//    */
//     public getScalarDataArrays(): Types.VolumeScalarData[] {
//         return [<Types.VolumeScalarData>this.scalarData];
//       }

//       protected invalidateVolume(immediate: boolean): void {
//         const { imageData, vtkOpenGLTexture } = this;
//         const { numFrames } = this;
    
//         for (let i = 0; i < numFrames; i++) {
//           vtkOpenGLTexture.setUpdatedFrame(i);
//         }
    
//         imageData.modified();
    
//         if (immediate) {
//           autoLoad(this.volumeId);
//         }
//       }

//     /**
//    * It triggers a prefetch for images in the volume.
//    * @param callback - A callback function to be called when the volume is fully loaded
//    * @param priority - The priority for loading the volume images, lower number is higher priority
//    * @returns
//    */
//   public load = (
//     callback: (...args: unknown[]) => void,
//   ): void => {

//     console.log('===load()===')
    
//       if (callback) 
//       {
//         callback({
//           success: true,
//           framesLoaded: this.numFrames,
//           framesProcessed: this.numFrames,
//           numFrames: this.numFrames,
//           totalNumFrames: this.numFrames,
//         });
//     }
//   };
} // class
