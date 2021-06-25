import { Component, OnInit, OnDestroy } from "@angular/core";
import * as html2pdf from "html2pdf.js";
import { MatDialog } from "@angular/material";
import { BookingService } from "../../booking/booking.service";
import { DialougComponent } from "src/app/shared/dialoug/dialoug.component";
import { TranslateService } from "@ngx-translate/core";
import { DataStorageService } from "src/app/core/services/data-storage.service";
import { NotificationDtoModel } from "src/app/shared/models/notification-model/notification-dto.model";
import Utils from "src/app/app.util";
import * as appConstants from "../../../app.constants";
import { RequestModel } from "src/app/shared/models/request-model/RequestModel";
import { Subscription } from "rxjs";
import { ConfigService } from "src/app/core/services/config.service";
import { ActivatedRoute, Router } from "@angular/router";
import { NameList } from "src/app/shared/models/demographic-model/name-list.modal";
import { UserModel } from "src/app/shared/models/demographic-model/user.modal";

@Component({
  selector: "app-acknowledgement",
  templateUrl: "./acknowledgement.component.html",
  styleUrls: ["./acknowledgement.component.css"],
})
export class AcknowledgementComponent implements OnInit, OnDestroy {
  usersInfoArr = [];
  ackDataArr = [];
  ackDataItem = {};
  guidelines = [];
  guidelinesDetails = [];
  pdfOptions = {};
  fileBlob: Blob;
  showSpinner: boolean = true;
  notificationRequest = new FormData();
  bookingDataPrimary = "";
  bookingDataSecondary = "";
  subscriptions: Subscription[] = [];
  notificationTypes: string[];
  preRegIds: any;
  regCenterId;
  langCode;
  name = "";
  applicantContactDetails = [];
  constructor(
    private bookingService: BookingService,
    private dialog: MatDialog,
    private translate: TranslateService,
    private dataStorageService: DataStorageService,
    private configService: ConfigService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.translate.use(localStorage.getItem("langCode"));
    this.langCode = localStorage.getItem("langCode");
  }

  async ngOnInit() {
    if (this.router.url.includes("multiappointment")) {
      this.preRegIds = [...JSON.parse(localStorage.getItem("multiappointment"))];
    } else {
      this.activatedRoute.params.subscribe((param) => {
        this.preRegIds = [param["appId"]];
      });
    }
    this.name = this.configService.getConfigByKey(
      appConstants.CONFIG_KEYS.preregistartion_identity_name
    );
    await this.getUserInfo(this.preRegIds);
    console.log(this.usersInfoArr);
    for (let i = 0; i < this.usersInfoArr.length; i++) {
      await this.getRegCenterDetails(this.usersInfoArr[i].langCode, i);
      await this.getLabelDetails(this.usersInfoArr[i].langCode, i);
    }

    let notificationTypes = this.configService
      .getConfigByKey(appConstants.CONFIG_KEYS.mosip_notification_type)
      .split("|");
    this.notificationTypes = notificationTypes.map((item) =>
      item.toUpperCase()
    );
    this.pdfOptions = {
      margin: [0.25, 0.25, 0.25, 0.25],
      filename: this.usersInfoArr[0].preRegId + ".pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 1 },
      jsPDF: { unit: "in", format: "a4", orientation: "landscape" },
    };

    await this.apiCalls();
    if (this.bookingService.getSendNotification()) {
      this.bookingService.resetSendNotification();
      this.automaticNotification();
    }
    this.prepareAckDataForUI();
    this.showSpinner = false;
  }

  getUserInfo(preRegIds: string[]) {
    return new Promise((resolve) => {
      preRegIds.forEach(async (prid: any, index) => {
        await this.getUserDetails(prid).then(async (user) => {
          let regDto;
          //console.log(user);
          await this.getAppointmentDetails(prid).then((appointmentDetails) => {
            regDto = appointmentDetails;
          });
          let applicationLanguages = [];
          const demographicData = user["request"].demographicDetails.identity;
          if (demographicData) {
            let keyArr: any[] = Object.keys(demographicData);
            for (let index = 0; index < keyArr.length; index++) {
              const elementKey = keyArr[index];
              let dataArr = demographicData[elementKey];
              if (Array.isArray(dataArr)) {
                dataArr.forEach((dataArrElement) => {
                  if (
                    !applicationLanguages.includes(dataArrElement.language)
                  ) {
                    applicationLanguages.push(dataArrElement.language);
                  }
                });
              }
            }
          } 
          console.log(`applicationLanguages: ${applicationLanguages}`);
          applicationLanguages.forEach(applicationLang => {
            const nameListObj: NameList = {
              preRegId: "",
              fullName: "",
              regDto: "",
              status: "",
              registrationCenter: "",
              bookingData: "",
              postalCode: "",
              langCode: "",
              labelDetails: [],
            };
            nameListObj.preRegId = user["request"].preRegistrationId;
            nameListObj.status = user["request"].statusCode;
            if (demographicData[this.name]) {
              let nameValues = demographicData[this.name];
              nameValues.forEach(nameVal => {
                if (nameVal["language"] == applicationLang) {
                  nameListObj.fullName = nameVal["value"];
                }
              });  
            }
            if (demographicData["postalCode"]) {
              nameListObj.postalCode = demographicData["postalCode"];
            }
            nameListObj.registrationCenter = "";
            nameListObj.langCode = applicationLang;
            nameListObj.regDto = regDto;
            this.usersInfoArr.push(nameListObj);
            console.log(this.usersInfoArr);
          });
          this.applicantContactDetails[1] = demographicData["phone"];
          this.applicantContactDetails[0] = demographicData["email"];
        });
        if (index === preRegIds.length - 1) {
          resolve(true);
        }
      });
    });
  }

  getUserDetails(prid) {
    return new Promise((resolve) => {
      this.dataStorageService.getUser(prid.toString()).subscribe((response) => {
        if (response[appConstants.RESPONSE] !== null) {
          resolve(
            new UserModel(
              prid.toString(),
              response[appConstants.RESPONSE],
              undefined,
              []
            )
          );
        }
      });
    });
  }

  getAppointmentDetails(preRegId) {
    return new Promise((resolve) => {
      this.dataStorageService
        .getAppointmentDetails(preRegId)
        .subscribe((response) => {
          //console.log(response);
          if (response[appConstants.RESPONSE]) {
            this.regCenterId =
            response[appConstants.RESPONSE].registration_center_id;
          }
          resolve(response[appConstants.RESPONSE]);
        });
    });
  }

  getRegCenterDetails(langCode, index) {
    return new Promise((resolve) => {
      this.dataStorageService
        .getRegistrationCentersById(this.regCenterId, langCode)
        .subscribe((response) => {
          if (response[appConstants.RESPONSE]) {
            this.usersInfoArr[index].registrationCenter =
              response[appConstants.RESPONSE].registrationCenters[0];
            resolve(true);
          }
        });
    });
  }

  async getLabelDetails(langCode, index) {
    return new Promise((resolve) => {
      this.dataStorageService
      .getI18NLanguageFiles(langCode)
      .subscribe((response) => {
        this.usersInfoArr[index].labelDetails.push(response["acknowledgement"]);
        resolve(true);
      });
    });
  }

  prepareAckDataForUI() {
    this.preRegIds.forEach(prid => {
      let ackDataItem = {
        "qrCodeBlob": null,
      };
      let preRegIdLabels = [],
      appDateLabels = [],
      contactPhoneLabels = [],
      messages = [],
      labelNames = [],
      nameValues = [],
      labelRegCntrs = [],
      regCntrNames = [],
      appLangCode = []; 
      this.ackDataItem["preRegId"] = prid;
      
      this.ackDataItem["contactPhone"] =
        this.usersInfoArr[0].registrationCenter.contactPhone;
      
      this.usersInfoArr.forEach(userInfo => {
        if (userInfo.preRegId == prid) {
          this.ackDataItem["qrCodeBlob"] = userInfo.qrCodeBlob;
          this.ackDataItem["bookingTimePrimary"] = userInfo.bookingTimePrimary;
          this.ackDataItem["bookingDataPrimary"] = userInfo.bookingDataPrimary;
          const labels = userInfo.labelDetails[0];
          preRegIdLabels.push(labels.label_pre_id);
          appDateLabels.push(labels.label_appointment_date_time);
          contactPhoneLabels.push(labels.label_cntr_contact_number);
          labelNames.push(labels.label_name);
          labelRegCntrs.push(labels.label_reg_cntr);
          nameValues.push(userInfo.fullName);
          regCntrNames.push(userInfo.registrationCenter.name);
          appLangCode.push(userInfo.langCode);
          //set the message in user login lang if available
          let fltrLangs = this.usersInfoArr.filter(userInfoItm => userInfoItm.preRegId == userInfo.preRegId && userInfoItm.langCode == this.langCode);
          if (fltrLangs.length == 1) {
            //matching lang found
            let fltr = messages.filter(msg => msg.preRegId == fltrLangs[0].preRegId);
            if (fltr.length == 0) {
              messages.push({
                "preRegId": fltrLangs[0].preRegId,
                "message": fltrLangs[0].labelDetails[0].message
              });
            }
          } else {
            let fltr = messages.filter(msg => msg.preRegId == userInfo.preRegId);
            if (fltr.length == 0) {
              messages.push({
                "preRegId": userInfo.preRegId,
                "message": userInfo.labelDetails[0].message
              });  
            }
          }
        }
      });

      this.ackDataItem["appLangCode"] = appLangCode;
      this.ackDataItem["preRegIdLabels"] = JSON.stringify(
        preRegIdLabels
      )
        .replace(/\[/g, "")
        .replace(/,/g, " / ")
        .replace(/"/g, " ")
        .replace(/]/g, "");
      this.ackDataItem["appDateLabels"] = JSON.stringify(appDateLabels)
        .replace(/\[/g, "")
        .replace(/,/g, " / ")
        .replace(/"/g, " ")
        .replace(/]/g, "");
      this.ackDataItem["contactPhoneLabels"] = JSON.stringify(
        contactPhoneLabels
      )
        .replace(/\[/g, "")
        .replace(/,/g, " / ")
        .replace(/"/g, " ")
        .replace(/]/g, "");
      this.ackDataItem["messages"] = messages;
      this.ackDataItem["labelNames"] = JSON.stringify(labelNames)
        .replace(/\[/g, "")
        .replace(/,/g, " / ")
        .replace(/"/g, " ")
        .replace(/]/g, "");
      this.ackDataItem["nameValues"] = JSON.stringify(nameValues)
        .replace(/\[/g, "")
        .replace(/,/g, " / ")
        .replace(/"/g, " ")
        .replace(/]/g, "");
      this.ackDataItem["labelRegCntrs"] = JSON.stringify(labelRegCntrs)
        .replace(/\[/g, "")
        .replace(/,/g, " / ")
        .replace(/"/g, " ")
        .replace(/]/g, "");
      this.ackDataItem["regCntrNames"] = JSON.stringify(regCntrNames)
        .replace(/\[/g, "")
        .replace(/,/g, " / ")
        .replace(/"/g, " ")
        .replace(/]/g, "");
      for (let j = 0; j < this.guidelines.length; j++) {
        if (appLangCode.includes(this.guidelines[j].langCode)) {
          this.ackDataItem[
            this.guidelines[j].langCode
          ] = this.guidelines[j].fileText.split("\n");
        }
      }
      this.ackDataArr.push(this.ackDataItem);
      this.ackDataItem = {};
    });
    
  }

  async apiCalls() {
    return new Promise(async (resolve) => {
      this.formatDateTime();
      //await this.qrCodeForUser();
      await this.getTemplate();
     
      resolve(true);
    });
  }

  async qrCodeForUser() {
    return new Promise((resolve) => {
      this.usersInfoArr.forEach(async (user) => {
        await this.generateQRCode(user);
        if (this.usersInfoArr.indexOf(user) === this.usersInfoArr.length - 1) {
          resolve(true);
        }
      });
    });
  }

  formatDateTime() {
    for (let i = 0; i < this.usersInfoArr.length; i++) {
      if (!this.usersInfoArr[i].bookingData) {
        this.usersInfoArr[i].bookingDataPrimary = Utils.getBookingDateTime(
          this.usersInfoArr[i].regDto.appointment_date,
          this.usersInfoArr[i].regDto.time_slot_from,
          this.usersInfoArr[i].langCode
        );
        this.usersInfoArr[i].bookingTimePrimary = Utils.formatTime(
          this.usersInfoArr[i].regDto.time_slot_from
        );
      } else {
        const date = this.usersInfoArr[i].bookingData.split(",");
        this.usersInfoArr[i].bookingDataPrimary = Utils.getBookingDateTime(
          date[0],
          date[1],
          this.usersInfoArr[i].langCode
        );
        this.usersInfoArr[i].bookingTimePrimary = Utils.formatTime(date[1]);
      }
    }
  }

  automaticNotification() {
    setTimeout(() => {
      this.sendNotification(this.applicantContactDetails, false);
    }, 500);
  }

  getTemplate() {
    return new Promise((resolve) => {
      const subs = this.dataStorageService
        .getGuidelineTemplate("Onscreen-Acknowledgement")
        .subscribe((response) => {
          this.guidelines = response["response"]["templates"];
          console.log(this.guidelines);
          resolve(true);
        });
      this.subscriptions.push(subs);
    });
  }

  download() {
    window.scroll(0, 0);
    const element = document.getElementById("print-section");
    html2pdf(element, this.pdfOptions);
  }

  async generateBlob() {
    const element = document.getElementById("print-section");
    return await html2pdf()
      .set(this.pdfOptions)
      .from(element)
      .outputPdf("dataurlstring");
  }

  async createBlob() {
    const dataUrl = await this.generateBlob();
    // convert base64 to raw binary data held in a string
    const byteString = atob(dataUrl.split(",")[1]);

    // separate out the mime component
    const mimeString = dataUrl.split(",")[0].split(":")[1].split(";")[0];

    // write the bytes of the string to an ArrayBuffer
    const arrayBuffer = new ArrayBuffer(byteString.length);

    var _ia = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
      _ia[i] = byteString.charCodeAt(i);
    }

    const dataView = new DataView(arrayBuffer);
    return await new Blob([dataView], { type: mimeString });
  }

  sendAcknowledgement() {
    const data = {
      case: "SEND_ACKNOWLEDGEMENT",
      notificationTypes: this.notificationTypes,
    };
    const subs = this.dialog
      .open(DialougComponent, {
        width: "350px",
        data: data
      })
      .afterClosed()
      .subscribe((applicantNumber) => {
        console.log(applicantNumber);
        if (applicantNumber !== undefined) {
          this.sendNotification(applicantNumber, true);
        }
      });
    this.subscriptions.push(subs);
  }

  async generateQRCode(name) {
    try {
      const index = this.usersInfoArr.indexOf(name);
      if (!this.usersInfoArr[index].qrCodeBlob) {
        return new Promise((resolve) => {});
      }
    } catch (ex) {
      console.log("this.usersInfo[index].qrCodeBlob>>>" + ex.messages);
    }
  }

  async sendNotification(applicantNumber, additionalRecipient: boolean) {
    this.fileBlob = await this.createBlob();
    let notificationObject = {};
    let preRegId;
    this.usersInfoArr.forEach((user) => {
      preRegId = user.preRegId;
      notificationObject[user.langCode] = new NotificationDtoModel(
        user.fullName,
        user.preRegId,
        user.bookingData
          ? user.bookingData.split(",")[0]
          : user.regDto.appointment_date,
        Number(user.bookingTimePrimary.split(":")[0]) < 10
          ? "0" + user.bookingTimePrimary
          : user.bookingTimePrimary,
        applicantNumber[1] === undefined ? null : applicantNumber[1],
        applicantNumber[0] === undefined ? null : applicantNumber[0],
        additionalRecipient,
        false
      );
    });
    const model = new RequestModel(
      appConstants.IDS.notification,
      notificationObject
    );
    this.notificationRequest.append(
      appConstants.notificationDtoKeys.notificationDto,
      JSON.stringify(model).trim()
    );
    this.notificationRequest.append(
      appConstants.notificationDtoKeys.langCode,
      Object.keys(notificationObject).join(",")
    );
    this.notificationRequest.append(
      appConstants.notificationDtoKeys.file,
      this.fileBlob,
      `${preRegId}.pdf`
    );
    const subs = this.dataStorageService
      .sendNotification(this.notificationRequest)
      .subscribe(() => {});
    this.subscriptions.push(subs);
    this.notificationRequest = new FormData();
  }

  ngOnDestroy() {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }
}
